export type FitToggleAction<State> = { kind: "fit" } | { kind: "restore"; state: State };

export class FitToggleState<State> {
  readonly #clone: (state: State) => State;
  #bookmark: State | null = null;

  constructor(clone: (state: State) => State) {
    this.#clone = clone;
  }

  get isFitted(): boolean {
    return this.#bookmark !== null;
  }

  toggle(current: State): FitToggleAction<State> {
    if (this.#bookmark !== null) {
      const state = this.#clone(this.#bookmark);
      this.#bookmark = null;
      return { kind: "restore", state };
    }

    this.#bookmark = this.#clone(current);
    return { kind: "fit" };
  }

  reset(): void {
    this.#bookmark = null;
  }
}
