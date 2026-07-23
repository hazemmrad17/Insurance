import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { runRiskAssessment } from '../services/orchestrator.service.js';
import { runRiskAnalystAgent } from '../services/riskAnalystAgent.js';
import { db } from '../database/client.js';
import { assessments } from '../database/schema.js';
import { optionalAuth, requireAuth, type AuthEnv } from '../middleware/auth.js';

export const riskRoutes = new Hono<AuthEnv>();

const assessSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1),
  banId: z.string().optional(),
  communeCode: z.string().optional(),
  communeName: z.string().optional(),
  departmentCode: z.string().optional(),
  propertyId: z.string().optional(),
});

riskRoutes.post('/assess', optionalAuth, zValidator('json', assessSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const result = await runRiskAssessment(data, user?.sub);
  return c.json(result);
});

const agentReviewSchema = z.object({
  client_form: z.record(z.unknown()),
}).strict();

function parseSnapshot(value: string | null): unknown {
  return value === null ? null : JSON.parse(value);
}

riskRoutes.post(
  '/assess/:id/agent-review',
  requireAuth,
  zValidator('json', agentReviewSchema),
  async (c) => {
    const user = c.get('user');
    const assessmentId = c.req.param('id');
    const { client_form } = c.req.valid('json');

    const assessment = await db
      .select()
      .from(assessments)
      .where(
        and(
          eq(assessments.id, assessmentId),
          eq(assessments.userId, user.sub),
        ),
      )
      .get();

    if (!assessment) {
      return c.json(
        { error: 'NOT_FOUND', message: 'Evaluation non trouvée' },
        404,
      );
    }

    const scoreValues = [
      assessment.inondationScore,
      assessment.rgaScore,
      assessment.tempeteScore,
      assessment.incendieScore,
      assessment.seismeScore,
      assessment.globalScore,
    ];

    if (scoreValues.some((score) => score === null)) {
      return c.json(
        {
          error: 'INCOMPLETE_ASSESSMENT',
          message: 'Les scores déterministes de cette évaluation sont incomplets',
        },
        422,
      );
    }

    let orchestratorData: Record<string, unknown>;
    try {
      orchestratorData = {
        property: parseSnapshot(assessment.buildingData),
        valuation: parseSnapshot(assessment.valuationData),
        geography: parseSnapshot(assessment.geographyData),
        risks: parseSnapshot(assessment.risksData),
        climate: parseSnapshot(assessment.climateData),
        metadata: parseSnapshot(assessment.metadataData),
      };
    } catch (error) {
      console.error(
        `[RiskAnalystRoute] Invalid snapshot for assessment ${assessmentId}:`,
        error,
      );
      return c.json(
        {
          error: 'INVALID_ASSESSMENT_SNAPSHOT',
          message: "L'instantané de l'évaluation est invalide",
        },
        500,
      );
    }

    const result = await runRiskAnalystAgent({
      orchestrator_data: orchestratorData,
      client_form,
      deterministic_score: {
        inondation: assessment.inondationScore!,
        rga: assessment.rgaScore!,
        tempete: assessment.tempeteScore!,
        incendie: assessment.incendieScore!,
        seisme: assessment.seismeScore!,
        global: assessment.globalScore!,
      },
    });

    if ('agent_review' in result && result.agent_review === 'failed') {
      return c.json(result, 502);
    }

    return c.json(result);
  },
);
