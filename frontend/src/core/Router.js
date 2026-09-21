/**
 * VibeVault — Hash SPA Router
 */

import { store } from './Store.js';
import { LandingPage } from '../components/LandingPage.js';
import { LoggedOutScreen } from '../components/LoggedOutScreen.js';

export class Router {
  constructor(routes = {}) {
    this.routes = routes;
    this.currentRoute = null;
    this.currentView = null;
    this.appContainer = null;
  }

  init(containerElement) {
    this.appContainer = containerElement;

    window.addEventListener('hashchange', () => this.handleRoute());

    // Only re-route on actual sign-in / sign-out boundary transitions.
    // Updating profile fields on an already-authenticated user must NOT trigger a full re-route.
    document.addEventListener('stateChange', (e) => {
      if (e.detail.key === 'currentUser') {
        const wasNull = e.detail.oldValue === null || e.detail.oldValue === undefined;
        const isNull = e.detail.value === null || e.detail.value === undefined;
        // Re-route only if the nullness changed (sign in or sign out event)
        if (wasNull !== isNull) {
          this.handleRoute();
        }
      }
      if (e.detail.key === 'isAuthenticated') {
        this.handleRoute();
      }
      if (e.detail.key === 'authNotice') {
        this.handleRoute();
      }
    });

    this.handleRoute();
  }

  register(path, viewComponentClass) {
    this.routes[path] = viewComponentClass;
  }

  navigate(path) {
    window.location.hash = path;
  }

  async handleRoute() {
    let hash = window.location.hash.slice(1) || '/';
    store.currentRoute = hash;

    // Check parameterized routes (e.g. /album/:id, /join/:code)
    let matchedRoute = null;
    let params = {};

    for (const routePattern of Object.keys(this.routes)) {
      const match = this.matchRoute(routePattern, hash);
      if (match) {
        matchedRoute = routePattern;
        params = match.params;
        break;
      }
    }

    if (!matchedRoute) {
      matchedRoute = '/';
      hash = '/';
    }

    let ViewClass = this.routes[matchedRoute];

    if (store.authNotice && !store.currentUser) {
      ViewClass = LoggedOutScreen;
    }

    // If user is at home route '/' and NOT authenticated, show LandingPage
    if (!store.authNotice && matchedRoute === '/' && !store.currentUser) {
      ViewClass = LandingPage;
    }

    if (this.currentView) {
      this.currentView.unmount();
      this.currentView = null;
    }

    if (ViewClass) {
      this.currentView = new ViewClass({ router: this, params });
      this.currentView.mount(this.appContainer);
    }
  }

  matchRoute(pattern, path) {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        const paramName = patternParts[i].slice(1);
        params[paramName] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }

    return { params };
  }
}
