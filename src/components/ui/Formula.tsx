import { useMemo } from 'react';
import katex from 'katex';

interface FormulaProps {
  /** The TeX source to render (language-independent). */
  readonly tex: string;
  /** Optional accessible label / caption for screen readers. */
  readonly ariaLabel?: string;
}

/**
 * Render a KaTeX expression. `throwOnError: false` makes a malformed formula
 * degrade to red source text instead of crashing the page. KaTeX glyphs inherit
 * `currentColor`, so both light and dark themes are handled by the surrounding
 * text color — no theme-specific styling needed here.
 */
const renderTex = (tex: string, displayMode: boolean): string =>
  katex.renderToString(tex, { displayMode, throwOnError: false, output: 'htmlAndMathml' });

/** A centered, block-level equation (its own line). */
export const Formula = ({ tex, ariaLabel }: FormulaProps) => {
  const html = useMemo(() => renderTex(tex, true), [tex]);
  return (
    <div
      className="formula-block"
      role="math"
      aria-label={ariaLabel ?? tex}
      // KaTeX output is trusted (we generate it locally from static TeX literals).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/** An inline equation, flowing within a sentence. */
export const InlineFormula = ({ tex, ariaLabel }: FormulaProps) => {
  const html = useMemo(() => renderTex(tex, false), [tex]);
  return (
    <span
      className="formula-inline"
      role="math"
      aria-label={ariaLabel ?? tex}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
