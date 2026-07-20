/**
 * Prévia — Data Model Layer
 * 
 * Defines the core types for Clients, Properties, and Assessments,
 * plus a singleton DataStore that enforces their relationships.
 */

// ──── TYPES ────

export type ClientStatus = 'active' | 'pending' | 'suspended';
export type RiskLevel = 'high' | 'medium' | 'low';
export type ContractType = 'mrh' | 'auto' | 'pro' | 'vie' | 'sante';
export type PaymentFrequency = 'annuel' | 'semestriel' | 'trimestriel' | 'mensuel';
export type PaymentMethod = 'prelevement' | 'virement' | 'cheque' | 'carte';
export type AssessmentStatus = 'completed' | 'pending';

export interface Client {
  id: string;
  civility: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  email: string;
  phone: string;
  profession: string;
  avatar: string; // initials
  status: ClientStatus;
  
  // Addresses
  insuredAddress: string;
  insuredAddressComplement: string;
  insuredPostalCode: string;
  insuredCity: string;
  correspondenceAddress: string;
  correspondencePostalCode: string;
  correspondenceCity: string;

  // Contract
  contractType: ContractType;
  contractTypeLabel: string;
  policyNumber: string;
  clientRef: string;
  effectiveDate: string;
  expiryDate: string;
  
  // Financial
  annualPremium: number;
  paymentFrequency: PaymentFrequency;
  depositGuarantee: number;
  paymentMethod: PaymentMethod;
  iban: string;
  bic: string;

  // Documents flags
  ribDeposited: boolean;
  identityDeposited: boolean;
  sepaMandateStatus: 'deposited' | 'pending';

  // FK references
  propertyIds: string[];
  assessmentIds: string[];
}

export interface Property {
  id: string;
  address: string;
  addressShort: string;
  city: string;
  clientId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  dpeClass: string;
  builtYear: number;
  assessmentIds: string[];
}

export interface Assessment {
  id: string;
  propertyId: string;
  clientId: string;
  date: string;
  status: AssessmentStatus;
  score: number;
  pages: number;
  riskSummary: string;
}

export interface Document {
  id: string;
  clientId: string;
  name: string;
  type: string;
  size: string;
  date: string;
  status: 'complete' | 'pending';
  icon: string;
  iconColor: string;
}

export interface ContractDoc {
  id: string;
  clientId: string;
  name: string;
  meta: string;
  amount: string;
  status: 'active';
  type: string;
  typeIcon: string;
  typeColor: string;
  expiryDate: string;
  renewal: string;
}

// ──── DATA STORE ────

class DataStore {
  private clients = new Map<string, Client>();
  private properties = new Map<string, Property>();
  private assessments = new Map<string, Assessment>();
  private contracts = new Map<string, ContractDoc>();
  private documents = new Map<string, Document>();

  constructor() {
    this.seed();
  }

  // ──── Queries ────

  getClient(id: string): Client | undefined {
    return this.clients.get(id);
  }

  getAllClients(): Client[] {
    return Array.from(this.clients.values());
  }

  getClientProperties(clientId: string): Property[] {
    const client = this.clients.get(clientId);
    if (!client) return [];
    return client.propertyIds.map(id => this.properties.get(id)).filter(Boolean) as Property[];
  }

  getClientAssessments(clientId: string): Assessment[] {
    const client = this.clients.get(clientId);
    if (!client) return [];
    return client.assessmentIds.map(id => this.assessments.get(id)).filter(Boolean) as Assessment[];
  }

  getClientContracts(clientId: string): ContractDoc[] {
    return Array.from(this.contracts.values()).filter(c => c.clientId === clientId);
  }

  getClientDocuments(clientId: string): Document[] {
    return Array.from(this.documents.values()).filter(d => d.clientId === clientId);
  }

  getProperty(id: string): Property | undefined {
    return this.properties.get(id);
  }

  getPropertyClient(propertyId: string): Client | undefined {
    const prop = this.properties.get(propertyId);
    if (!prop) return undefined;
    return this.clients.get(prop.clientId);
  }

  getAllProperties(): Property[] {
    return Array.from(this.properties.values());
  }

  getPropertyAssessments(propertyId: string): Assessment[] {
    const prop = this.properties.get(propertyId);
    if (!prop) return [];
    return prop.assessmentIds.map(id => this.assessments.get(id)).filter(Boolean) as Assessment[];
  }

  getAllAssessments(): Assessment[] {
    return Array.from(this.assessments.values());
  }

  // ──── Mutations ────

  addClient(client: Client): void {
    this.clients.set(client.id, client);
  }

  addProperty(property: Property): void {
    this.properties.set(property.id, property);
  }

  addAssessment(assessment: Assessment): void {
    this.assessments.set(assessment.id, assessment);
  }

  linkPropertyToClient(clientId: string, propertyId: string): void {
    const client = this.clients.get(clientId);
    const property = this.properties.get(propertyId);
    if (client && property) {
      if (!client.propertyIds.includes(propertyId)) {
        client.propertyIds.push(propertyId);
      }
      property.clientId = clientId;
    }
  }

  // ──── Seed Data ────

  private seed(): void {
    // Clients
    this.clients.set('client-1', {
      id: 'client-1',
      civility: 'M.',
      firstName: 'Jean',
      lastName: 'Dupont',
      dateOfBirth: '1978-05-12',
      nationality: 'FR',
      email: 'jean.dupont@email.fr',
      phone: '+33 6 12 34 56 78',
      profession: 'Architecte',
      avatar: 'JD',
      status: 'active',
      insuredAddress: '8 Rue de la Paix',
      insuredAddressComplement: '',
      insuredPostalCode: '75002',
      insuredCity: 'Paris',
      correspondenceAddress: '8 Rue de la Paix',
      correspondencePostalCode: '75002',
      correspondenceCity: 'Paris',
      contractType: 'mrh',
      contractTypeLabel: 'Multirisque habitation',
      policyNumber: 'POL-2026-00428-FR',
      clientRef: 'CLT-2026-001',
      effectiveDate: '2026-01-15',
      expiryDate: '2027-01-14',
      annualPremium: 1240,
      paymentFrequency: 'annuel',
      depositGuarantee: 500,
      paymentMethod: 'prelevement',
      iban: 'FR76 3000 2005 0100 1234 5678 901',
      bic: 'CRLYFRPP',
      ribDeposited: true,
      identityDeposited: true,
      sepaMandateStatus: 'pending',
      propertyIds: ['prop-1', 'prop-4', 'prop-7'],
      assessmentIds: ['assess-1', 'assess-4'],
    });

    this.clients.set('client-2', {
      id: 'client-2',
      civility: 'Mme',
      firstName: 'Marie',
      lastName: 'Bernard',
      dateOfBirth: '1985-09-23',
      nationality: 'FR',
      email: 'marie.bernard@email.fr',
      phone: '+33 6 98 76 54 32',
      profession: 'Avocate',
      avatar: 'MB',
      status: 'active',
      insuredAddress: '15 Bd Haussmann',
      insuredAddressComplement: 'Appt 4B',
      insuredPostalCode: '75009',
      insuredCity: 'Paris',
      correspondenceAddress: '15 Bd Haussmann',
      correspondencePostalCode: '75009',
      correspondenceCity: 'Paris',
      contractType: 'auto',
      contractTypeLabel: 'Automobile',
      policyNumber: 'AUTO-2026-00357-FR',
      clientRef: 'CLT-2026-002',
      effectiveDate: '2026-02-01',
      expiryDate: '2027-01-31',
      annualPremium: 680,
      paymentFrequency: 'mensuel',
      depositGuarantee: 200,
      paymentMethod: 'prelevement',
      iban: 'FR76 3000 2005 0100 9876 5432 109',
      bic: 'CRLYFRPP',
      ribDeposited: true,
      identityDeposited: true,
      sepaMandateStatus: 'deposited',
      propertyIds: ['prop-2', 'prop-5', 'prop-8'],
      assessmentIds: ['assess-2', 'assess-5'],
    });

    this.clients.set('client-3', {
      id: 'client-3',
      civility: 'M.',
      firstName: 'Pierre',
      lastName: 'Lefèvre',
      dateOfBirth: '1965-03-17',
      nationality: 'FR',
      email: 'pierre.lefevre@email.fr',
      phone: '+33 6 45 67 89 01',
      profession: 'Commerçant',
      avatar: 'PL',
      status: 'pending',
      insuredAddress: '34 Rue de Rivoli',
      insuredAddressComplement: '',
      insuredPostalCode: '75004',
      insuredCity: 'Paris',
      correspondenceAddress: '34 Rue de Rivoli',
      correspondencePostalCode: '75004',
      correspondenceCity: 'Paris',
      contractType: 'pro',
      contractTypeLabel: 'Professionnelle',
      policyNumber: 'PRO-2026-00123-FR',
      clientRef: 'CLT-2026-003',
      effectiveDate: '2026-03-01',
      expiryDate: '2027-02-28',
      annualPremium: 2450,
      paymentFrequency: 'trimestriel',
      depositGuarantee: 800,
      paymentMethod: 'virement',
      iban: 'FR76 3000 2005 0100 4567 8901 234',
      bic: 'SOGEFRPP',
      ribDeposited: false,
      identityDeposited: true,
      sepaMandateStatus: 'pending',
      propertyIds: ['prop-3', 'prop-6'],
      assessmentIds: ['assess-3'],
    });

    this.clients.set('client-4', {
      id: 'client-4',
      civility: 'Mme',
      firstName: 'Sophie',
      lastName: 'Nguyen',
      dateOfBirth: '1990-11-08',
      nationality: 'FR',
      email: 'sophie.nguyen@email.fr',
      phone: '+33 6 23 45 67 89',
      profession: 'Médecin',
      avatar: 'SN',
      status: 'active',
      insuredAddress: '5 Rue de Rennes',
      insuredAddressComplement: '',
      insuredPostalCode: '33000',
      insuredCity: 'Bordeaux',
      correspondenceAddress: '5 Rue de Rennes',
      correspondencePostalCode: '33000',
      correspondenceCity: 'Bordeaux',
      contractType: 'sante',
      contractTypeLabel: 'Santé',
      policyNumber: 'SAN-2026-00987-FR',
      clientRef: 'CLT-2026-004',
      effectiveDate: '2026-01-01',
      expiryDate: '2026-12-31',
      annualPremium: 1890,
      paymentFrequency: 'annuel',
      depositGuarantee: 0,
      paymentMethod: 'prelevement',
      iban: 'FR76 3000 2005 0100 1111 2222 333',
      bic: 'BDFRFRPP',
      ribDeposited: true,
      identityDeposited: true,
      sepaMandateStatus: 'deposited',
      propertyIds: [],
      assessmentIds: [],
    });

    this.clients.set('client-5', {
      id: 'client-5',
      civility: 'M.',
      firstName: 'Lucas',
      lastName: 'Richard',
      dateOfBirth: '1992-07-25',
      nationality: 'FR',
      email: 'lucas.richard@email.fr',
      phone: '+33 6 34 56 78 90',
      profession: 'Ingénieur',
      avatar: 'LR',
      status: 'suspended',
      insuredAddress: '12 Rue Matabiau',
      insuredAddressComplement: '',
      insuredPostalCode: '31000',
      insuredCity: 'Toulouse',
      correspondenceAddress: '12 Rue Matabiau',
      correspondencePostalCode: '31000',
      correspondenceCity: 'Toulouse',
      contractType: 'mrh',
      contractTypeLabel: 'Multirisque habitation',
      policyNumber: 'MRH-2025-00150-FR',
      clientRef: 'CLT-2026-005',
      effectiveDate: '2025-06-01',
      expiryDate: '2026-12-31',
      annualPremium: 950,
      paymentFrequency: 'annuel',
      depositGuarantee: 300,
      paymentMethod: 'cheque',
      iban: 'FR76 3000 2005 0100 4444 5555 666',
      bic: 'CRLYFRPP',
      ribDeposited: true,
      identityDeposited: false,
      sepaMandateStatus: 'pending',
      propertyIds: [],
      assessmentIds: [],
    });

    this.clients.set('client-6', {
      id: 'client-6',
      civility: 'Mme',
      firstName: 'Claire',
      lastName: 'Petit',
      dateOfBirth: '1982-12-03',
      nationality: 'FR',
      email: 'claire.petit@email.fr',
      phone: '+33 6 56 78 90 12',
      profession: 'Enseignante',
      avatar: 'CP',
      status: 'pending',
      insuredAddress: '7 Rue du Bac',
      insuredAddressComplement: '',
      insuredPostalCode: '59000',
      insuredCity: 'Lille',
      correspondenceAddress: '7 Rue du Bac',
      correspondencePostalCode: '59000',
      correspondenceCity: 'Lille',
      contractType: 'vie',
      contractTypeLabel: 'Prévoyance / Vie',
      policyNumber: 'VIE-2026-00654-FR',
      clientRef: 'CLT-2026-006',
      effectiveDate: '2026-04-01',
      expiryDate: '2027-03-31',
      annualPremium: 3200,
      paymentFrequency: 'annuel',
      depositGuarantee: 0,
      paymentMethod: 'prelevement',
      iban: 'FR76 3000 2005 0100 7777 8888 999',
      bic: 'CRLYFRPP',
      ribDeposited: false,
      identityDeposited: false,
      sepaMandateStatus: 'pending',
      propertyIds: [],
      assessmentIds: [],
    });

    // Properties
    this.properties.set('prop-1', {
      id: 'prop-1',
      address: '8 Rue de la Paix, 75002 Paris',
      addressShort: '8 Rue de la Paix, Paris 2e',
      city: 'Paris',
      clientId: 'client-1',
      riskScore: 66,
      riskLevel: 'high',
      dpeClass: 'D',
      builtYear: 1978,
      assessmentIds: ['assess-1'],
    });
    this.properties.set('prop-2', {
      id: 'prop-2',
      address: '15 Bd Haussmann, 75009 Paris',
      addressShort: '15 Bd Haussmann, Paris 9e',
      city: 'Paris',
      clientId: 'client-2',
      riskScore: 48,
      riskLevel: 'medium',
      dpeClass: 'C',
      builtYear: 1985,
      assessmentIds: [],
    });
    this.properties.set('prop-3', {
      id: 'prop-3',
      address: '2 Place de la Bourse, 69002 Lyon',
      addressShort: '2 Pl. Bourse, Lyon 2e',
      city: 'Lyon',
      clientId: 'client-3',
      riskScore: 22,
      riskLevel: 'low',
      dpeClass: 'A',
      builtYear: 2005,
      assessmentIds: [],
    });
    this.properties.set('prop-4', {
      id: 'prop-4',
      address: '12 Av. Champs-Élysées, 75008 Paris',
      addressShort: '12 Av. Champs-Élysées, Paris 8e',
      city: 'Paris',
      clientId: 'client-1',
      riskScore: 72,
      riskLevel: 'high',
      dpeClass: 'E',
      builtYear: 1965,
      assessmentIds: [],
    });
    this.properties.set('prop-5', {
      id: 'prop-5',
      address: '5 Rue de Rennes, 75006 Paris',
      addressShort: '5 Rue de Rennes, Paris 6e',
      city: 'Paris',
      clientId: 'client-2',
      riskScore: 44,
      riskLevel: 'medium',
      dpeClass: 'D',
      builtYear: 1990,
      assessmentIds: [],
    });
    this.properties.set('prop-6', {
      id: 'prop-6',
      address: '34 Rue de Rivoli, 75004 Paris',
      addressShort: '34 Rue de Rivoli, Paris 4e',
      city: 'Paris',
      clientId: 'client-3',
      riskScore: 81,
      riskLevel: 'high',
      dpeClass: 'E',
      builtYear: 1960,
      assessmentIds: ['assess-3'],
    });
    this.properties.set('prop-7', {
      id: 'prop-7',
      address: '18 Rue Lafayette, 75009 Paris',
      addressShort: '18 Rue Lafayette, Paris 9e',
      city: 'Paris',
      clientId: 'client-1',
      riskScore: 18,
      riskLevel: 'low',
      dpeClass: 'B',
      builtYear: 2015,
      assessmentIds: [],
    });
    this.properties.set('prop-8', {
      id: 'prop-8',
      address: '7 Rue du Bac, 75007 Paris',
      addressShort: '7 Rue du Bac, Paris 7e',
      city: 'Paris',
      clientId: 'client-2',
      riskScore: 53,
      riskLevel: 'medium',
      dpeClass: 'D',
      builtYear: 1975,
      assessmentIds: [],
    });

    // Assessments
    this.assessments.set('assess-1', {
      id: 'assess-1',
      propertyId: 'prop-1',
      clientId: 'client-1',
      date: '17 déc. 2025',
      status: 'completed',
      score: 66,
      pages: 12,
      riskSummary: 'Inondation: Haut · Argile: Haut · Canicule: Moyen',
    });
    this.assessments.set('assess-2', {
      id: 'assess-2',
      propertyId: 'prop-2',
      clientId: 'client-2',
      date: '14 déc. 2025',
      status: 'completed',
      score: 48,
      pages: 10,
      riskSummary: 'Canicule: Moyen · DPE: C',
    });
    this.assessments.set('assess-3', {
      id: 'assess-3',
      propertyId: 'prop-6',
      clientId: 'client-3',
      date: '22 janv. 2026',
      status: 'pending',
      score: 81,
      pages: 15,
      riskSummary: 'Inondation: Très élevé · DPE: E',
    });
    this.assessments.set('assess-4', {
      id: 'assess-4',
      propertyId: 'prop-4',
      clientId: 'client-1',
      date: '8 févr. 2026',
      status: 'pending',
      score: 72,
      pages: 0,
      riskSummary: 'Inondation: Haut · DPE: E',
    });
    this.assessments.set('assess-5', {
      id: 'assess-5',
      propertyId: 'prop-5',
      clientId: 'client-2',
      date: '10 déc. 2025',
      status: 'completed',
      score: 44,
      pages: 8,
      riskSummary: 'DPE: D · Risque moyen',
    });

    // Contracts
    this.contracts.set('contract-1', {
      id: 'contract-1',
      clientId: 'client-1',
      name: 'Multirisque Habitation MRH-2026-00428',
      meta: '8 Rue de la Paix, 75002 Paris · Souscrit le 15/01/2026',
      amount: '1 240 € / an',
      status: 'active',
      type: 'home',
      typeIcon: 'home',
      typeColor: 'var(--color-primary)',
      expiryDate: '14/01/2027',
      renewal: 'Tacite',
    });
    this.contracts.set('contract-2', {
      id: 'contract-2',
      clientId: 'client-1',
      name: 'Avenant n°1 — Extension Garantie',
      meta: 'Ajout couverture tempête · Effet au 01/03/2026',
      amount: '+120 € / an',
      status: 'active',
      type: 'rider',
      typeIcon: 'description',
      typeColor: '#10b981',
      expiryDate: '14/01/2027',
      renewal: '',
    });

    // Documents
    this.documents.set('doc-1', {
      id: 'doc-1',
      clientId: 'client-1',
      name: 'Contrat_MRH_2026_00428_signe.pdf',
      type: 'Contrat',
      size: '2.4 MB',
      date: '15/01/2026',
      status: 'complete',
      icon: 'picture_as_pdf',
      iconColor: '#ef4444',
    });
    this.documents.set('doc-2', {
      id: 'doc-2',
      clientId: 'client-1',
      name: 'Piece_identite_Jean_Dupont.pdf',
      type: 'CNI',
      size: '1.1 MB',
      date: '10/01/2026',
      status: 'complete',
      icon: 'picture_as_pdf',
      iconColor: '#ef4444',
    });
    this.documents.set('doc-3', {
      id: 'doc-3',
      clientId: 'client-1',
      name: 'RIB_Jean_Dupont_CRLYFRPP.pdf',
      type: 'RIB',
      size: '0.3 MB',
      date: '12/01/2026',
      status: 'complete',
      icon: 'description',
      iconColor: '#3b82f6',
    });
    this.documents.set('doc-4', {
      id: 'doc-4',
      clientId: 'client-1',
      name: 'Mandat_SEPA_signé.pdf',
      type: 'Mandat',
      size: '0.5 MB',
      date: 'En attente',
      status: 'pending',
      icon: 'hourglass_bottom',
      iconColor: '#f59e0b',
    });
  }
}

export const store = new DataStore();
