import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  resetKey: string;
  onReset?: () => void;
  onAutoRecover?: () => void;
};

type State = {
  hasError: boolean;
};

export class PlannerErrorBoundary extends Component<Props, State> {
  private autoRecoverKey: string | null = null;
  private resetTimer: number | null = null;

  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Planner rendering error", error);

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
        this.setState({ hasError: false });
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
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="plannerCrashFallback" role="alert" aria-live="assertive">
        <div className="plannerCrashFallback__eyebrow">Recovered planner state</div>
        <strong>The current course view hit a bad course record.</strong>
        <span>
          Termer kept the page alive instead of blanking the whole screen. You can
          clear the current schedule and keep working, or reload the page once.
        </span>
        <div className="plannerCrashFallback__actions">
          <button type="button" onClick={this.handleReset}>
            Clear current schedule
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload planner
          </button>
        </div>
      </div>
    );
  }
}
