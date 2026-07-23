import { z } from 'zod';

const scoreSchema = z.number().int().min(0).max(100);

const perilReviewSchema = z.object({
  score_agent: scoreSchema,
  score_deterministe: scoreSchema,
  ecart_significatif: z.boolean(),
  donnees_insuffisantes: z.boolean(),
  justification: z.string().min(1),
}).strict();

export const riskAnalystOutputSchema = z.object({
  adresse: z.string().min(1),
  date_evaluation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  aleas: z.object({
    inondation: perilReviewSchema,
    rga: perilReviewSchema,
    tempete: perilReviewSchema,
    incendie: perilReviewSchema,
    seisme: perilReviewSchema,
  }).strict(),
  score_global_agent: scoreSchema,
  score_global_deterministe: scoreSchema,
  points_attention: z.array(z.string().min(1)).max(5),
  confiance: z.enum(['faible', 'moyenne', 'elevee']),
}).strict();

export type RiskAnalystOutput = z.infer<typeof riskAnalystOutputSchema>;
