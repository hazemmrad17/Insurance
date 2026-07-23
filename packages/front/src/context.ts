/**
 * Prévia — Navigation Context
 * 
 * Tracks which view, client, property, and assessment the user is currently
 * focused on. Enables cross-view navigation without losing state.
 */

export type AppView = 'overview' | 'map' | 'property' | 'portfolio' | 'assessments' | 'clients' | 'settings';

export interface ViewContext {
  activeView: AppView;
  activeSubTab: string;
  selectedClientId: string | null;
  selectedPropertyId: string | null;
  selectedAssessmentId: string | null;
}

type ContextChangeCallback = (ctx: ViewContext) => void;

class NavigationContext {
  private ctx: ViewContext = {
    activeView: 'overview',
    activeSubTab: 'summary',
    selectedClientId: null,
    selectedPropertyId: null,
    selectedAssessmentId: null,
  };

  private listeners: ContextChangeCallback[] = [];

  get context(): Readonly<ViewContext> {
    return { ...this.ctx };
  }

  onChange(cb: ContextChangeCallback): void {
    this.listeners.push(cb);
  }

  private notify(): void {
    const snapshot = this.context;
    this.listeners.forEach(cb => cb(snapshot));
  }

  navigateTo(view: AppView, subTab?: string): void {
    this.ctx.activeView = view;
    if (subTab) this.ctx.activeSubTab = subTab;
    this.notify();
    this.triggerViewSwitch();
  }

  selectClient(clientId: string | null): void {
    this.ctx.selectedClientId = clientId;
    this.notify();
  }

  selectProperty(propertyId: string | null): void {
    this.ctx.selectedPropertyId = propertyId;
    this.notify();
  }

  selectAssessment(assessmentId: string | null): void {
    this.ctx.selectedAssessmentId = assessmentId;
    this.notify();
  }

  navigateToProperty(propertyId: string, subTab?: string): void {
    this.ctx.selectedPropertyId = propertyId;
    this.ctx.selectedAssessmentId = null;
    this.navigateTo('property', subTab);
  }

  navigateToClient(clientId: string, subTab?: string): void {
    this.ctx.selectedClientId = clientId;
    this.ctx.selectedPropertyId = null;
    this.ctx.selectedAssessmentId = null;
    this.navigateTo('clients', subTab);
  }

  navigateToAssessment(assessmentId: string): void {
    this.ctx.selectedAssessmentId = assessmentId;
    this.navigateTo('assessments');
  }

  reset(): void {
    this.ctx = {
      activeView: 'overview',
      activeSubTab: 'summary',
      selectedClientId: null,
      selectedPropertyId: null,
      selectedAssessmentId: null,
    };
    this.notify();
  }

  private triggerViewSwitch(): void {
    const sidebarNav = document.querySelector(`.sidebar-nav .nav-item[data-view="${this.ctx.activeView}"]`) as HTMLElement | null;
    if (sidebarNav) {
      sidebarNav.click();
    }
  }
}

export const navContext = new NavigationContext();
