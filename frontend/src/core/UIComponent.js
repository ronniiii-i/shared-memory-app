/**
 * VibeVault — Base UI Component Class
 *
 * All UI components inherit from this class. It provides:
 * - DOM rendering lifecycle (mount/unmount/update)
 * - Automatic state subscription and cleanup
 * - Event listener tracking and cleanup on unmount
 * - Child component management
 * - Automatic Lucide icon initialization
 */

import { subscribe } from './Store.js';
import { createIcons, icons } from 'lucide';

export class UIComponent {
  /**
   * @param {Object} props - Component properties
   */
  constructor(props = {}) {
    /** @type {Object} Component properties */
    this.props = props;

    /** @type {HTMLElement|null} The component's root DOM element */
    this.element = null;

    /** @type {HTMLElement|null} The container this component is mounted in */
    this.container = null;

    /** @type {boolean} Whether the component is currently mounted */
    this.isMounted = false;

    /** @type {Array<Function>} Cleanup functions for state subscriptions */
    this._cleanups = [];

    /** @type {Array<{element: HTMLElement, event: string, handler: Function}>} Tracked event listeners */
    this._listeners = [];

    /** @type {Map<string, UIComponent>} Child components keyed by name */
    this._children = new Map();

    /** @type {AbortController|null} For cancelling ongoing async operations */
    this._abortController = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // Lifecycle Methods (Override in subclasses)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Return the HTML string for this component.
   * MUST be overridden by subclasses.
   * @returns {string} HTML string
   */
  render() {
    throw new Error(`${this.constructor.name} must implement render()`);
  }

  /**
   * Called after the component is mounted and its DOM is available.
   */
  onMount() {}

  /**
   * Called before the component is unmounted.
   */
  onUnmount() {}

  /**
   * Called after the component re-renders due to state or prop changes.
   */
  onUpdate() {}

  // ═══════════════════════════════════════════════════════════════
  // Core Lifecycle
  // ═══════════════════════════════════════════════════════════════

  /**
   * Mount this component into a container element.
   * @param {HTMLElement} container - The DOM element to mount into
   * @returns {this}
   */
  mount(container) {
    if (this.isMounted) {
      this.unmount();
    }

    this.container = container;
    this._abortController = new AbortController();

    // Create the component's root element from render()
    const html = this.render();
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    this.element = template.content.firstElementChild;

    if (!this.element) {
      throw new Error(`${this.constructor.name}.render() must return a single root element`);
    }

    // Append to container
    container.appendChild(this.element);
    this.isMounted = true;

    // Render Lucide icons automatically
    this.refreshIcons();

    // Call lifecycle hook
    this.onMount();

    return this;
  }

  /**
   * Unmount the component, removing it from the DOM and cleaning up.
   */
  unmount() {
    if (!this.isMounted) return;

    // Lifecycle hook
    this.onUnmount();

    // Unmount all children
    for (const [, child] of this._children) {
      child.unmount();
    }
    this._children.clear();

    // Remove all tracked event listeners
    for (const { element, event, handler } of this._listeners) {
      element?.removeEventListener(event, handler);
    }
    this._listeners = [];

    // Cancel all state subscriptions
    for (const cleanup of this._cleanups) {
      cleanup();
    }
    this._cleanups = [];

    // Cancel any pending async operations
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    // Remove from DOM
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.container = null;
    this.isMounted = false;
  }

  /**
   * Re-render the component in place, preserving its position in the DOM.
   */
  update() {
    if (!this.isMounted || !this.element || !this.container) return;

    // Unmount children before re-render
    for (const [, child] of this._children) {
      child.unmount();
    }
    this._children.clear();

    // Remove tracked event listeners
    for (const { element, event, handler } of this._listeners) {
      element?.removeEventListener(event, handler);
    }
    this._listeners = [];

    // Re-render HTML
    const html = this.render();
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const newElement = template.content.firstElementChild;

    if (!newElement) return;

    // Replace in DOM
    this.container.replaceChild(newElement, this.element);
    this.element = newElement;

    // Refresh Lucide icons
    this.refreshIcons();

    // Re-bind all event listeners by calling onMount again.
    // onMount() is the single authoritative place for delegate() calls,
    // and it must run after every render (both initial mount and updates).
    this.onMount();

    // Call onUpdate hook for any post-render work that should NOT re-bind listeners
    this.onUpdate();
  }

  /**
   * Refresh Lucide SVG icons within this component's DOM scope.
   */
  refreshIcons() {
    if (this.element) {
      try {
        createIcons({
          icons,
          nameAttr: 'data-lucide',
        });
      } catch (err) {
        // Safe catch if lucide package is initializing
      }
    }
  }

  /**
   * Update props and re-render.
   * @param {Object} newProps
   */
  setProps(newProps) {
    this.props = { ...this.props, ...newProps };
    this.update();
  }

  // ═══════════════════════════════════════════════════════════════
  // State Subscription Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Subscribe to store state changes. Automatically cleaned up on unmount.
   */
  watchState(keys, callback) {
    const cleanup = subscribe(keys, callback);
    this._cleanups.push(cleanup);
    return cleanup;
  }

  /**
   * Subscribe to state changes and auto-update the component.
   */
  reactTo(keys) {
    this.watchState(keys, () => {
      if (this.isMounted) {
        this.update();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Event Listener Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add an event listener cleanly.
   * If element/selector is conditionally absent, degrades gracefully without throwing warnings.
   */
  on(elementOrSelector, event, handler, options = {}) {
    let element;

    if (typeof elementOrSelector === 'string') {
      element = this.element?.querySelector(elementOrSelector);
      if (!element) {
        // Conditional element not present in current DOM state - omit warning
        return;
      }
    } else {
      element = elementOrSelector;
    }

    if (!element) return;

    element.addEventListener(event, handler, options);
    this._listeners.push({ element, event, handler });
  }

  /**
   * Add a delegated event listener on the component root.
   * Delegated events survive inner DOM updates.
   */
  delegate(event, selector, handler) {
    if (!this.element) return;

    const delegatedHandler = (e) => {
      const target = e.target.closest(selector);
      if (target && this.element?.contains(target)) {
        handler(e, target);
      }
    };

    this.element.addEventListener(event, delegatedHandler);
    this._listeners.push({ element: this.element, event, handler: delegatedHandler });
  }

  // ═══════════════════════════════════════════════════════════════
  // Child Component Helpers
  // ═══════════════════════════════════════════════════════════════

  mountChild(name, child, containerOrSelector) {
    if (this._children.has(name)) {
      this._children.get(name).unmount();
    }

    let container;
    if (typeof containerOrSelector === 'string') {
      container = this.element?.querySelector(containerOrSelector);
    } else {
      container = containerOrSelector;
    }

    if (!container) return child;

    child.mount(container);
    this._children.set(name, child);
    return child;
  }

  getChild(name) {
    return this._children.get(name);
  }

  // ═══════════════════════════════════════════════════════════════
  // DOM Query Helpers
  // ═══════════════════════════════════════════════════════════════

  $(selector) {
    return this.element?.querySelector(selector) || null;
  }

  $$(selector) {
    return this.element?.querySelectorAll(selector) || [];
  }
}
