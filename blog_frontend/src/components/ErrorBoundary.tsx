import React, {type ReactNode} from "react";
import {getFaro} from "../client-modules/faro";

interface FaroAwareErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface FaroAwareErrorBoundaryState {
  hasError: boolean;
}

/**
 * Root error boundary: reports React render crashes to Grafana Faro via pushError,
 * then renders the accessible fallback UI. Replaces @grafana/faro-react's
 * FaroErrorBoundary (dropped due to its react-router ^7 peer conflict with Docusaurus).
 */
export default class FaroAwareErrorBoundary extends React.Component<
  FaroAwareErrorBoundaryProps,
  FaroAwareErrorBoundaryState
> {
  state: FaroAwareErrorBoundaryState = {hasError: false};

  static getDerivedStateFromError(): FaroAwareErrorBoundaryState {
    return {hasError: true};
  }

  componentDidCatch(error: Error): void {
    try {
      getFaro()?.api.pushError(error, {type: "ErrorBoundary"});
    } catch {
      // Telemetry must never crash the error path
    }
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
