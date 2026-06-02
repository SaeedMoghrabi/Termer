import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  resetKey: string;
  onReset?: () => void;
  onAutoRecover?: () => void;
  sectionName?: string;
  compact?: boolean;
  resetLabel?: string;
};

type State = {
  hasError: boolean;
  errorMessage: string;
};

export class PlannerErrorBoundary extends Component<Props, State> {
  private autoRecoverKey: string | null = null;
  private resetTimer: number | null = null;

  state: State = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown render error";
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error(
      `Planner rendering error${this.props.sectionName ? ` in ${this.props.sectionName}` : ""}`,
      error,
      info,
    );

    if (this.autoRecoverKey === this.props.resetKey) {
      return;
    }

    this.autoRecoverKey = this.props.resetKey;
    this.props.onAutoRecover?.();

    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer);
    }

    this.resetTimer = window.setTimeout(() => {
      this.setState({ hasError: false });
      this.resetTimer = null;
    }, 0);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey) {
      this.autoRecoverKey = null;
      if (this.state.hasError) {
        this.setState({ hasError: false, errorMessage: "" });
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer);
    }
  }

  private handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const issueLabel = this.props.sectionName
      ? `${this.props.sectionName} hit a render problem.`
      : "The current course view hit a bad course record.";

    return (
      <div
        className={`plannerCrashFallback${this.props.compact ? " plannerCrashFallback--compact" : ""}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="plannerCrashFallback__eyebrow">Recovered planner state</div>
        <strong>{issueLabel}</strong>
        <span>
          {this.props.compact
            ? "Termer isolated this panel so the rest of the page can keep working."
            : "Termer kept the page alive instead of blanking the whole screen. You can clear the current schedule and keep working, or reload the page once."}
        </span>
        {this.state.errorMessage ? (
          <span className="plannerCrashFallback__detail">
            Issue: {this.state.errorMessage}
          </span>
        ) : null}
        <div className="plannerCrashFallback__actions">
          <button type="button" onClick={this.handleReset}>
            {this.props.resetLabel ?? (this.props.compact ? "Retry panel" : "Clear current schedule")}
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload planner
          </button>
        </div>
      </div>
    );
  }
}
