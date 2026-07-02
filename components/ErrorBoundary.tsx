import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorLevel, AiroError } from '../types';

interface Props {
  children: ReactNode;
  onError: (error: AiroError) => void;
}

interface State {
  hasError: boolean;
}

export class AiroErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.props.onError({
      level: ErrorLevel.RED,
      message: error.message,
      details: errorInfo.componentStack || undefined,
      timestamp: Date.now()
    });
  }

  public render() {
    return this.props.children;
  }
}
