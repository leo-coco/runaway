import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InfoPanel } from '@/components/ui/InfoPanel';
import { Formula } from '@/components/ui/Formula';
import { CalculationDetailsContent } from '@/features/projections/CalculationDetails';
import { SimulationMethodology } from '@/features/projections/SimulationDataSourcesModal';
import { usePlanContext } from '@/features/portfolio/PlanLayout';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import {
  buildMonteCarloInput,
  DEFAULT_MC_OPTIONS,
  isBitcoinSymbol,
  MODEL_PARAMS,
} from '@/services/monteCarlo';
import { DEFAULT_SCENARIO_CONFIG } from '@/domain/scenario';
import {
  CLASS_VOLATILITY,
  CLASS_CORRELATION,
  CLASS_CRASH_BETA,
  TICKER_VOLATILITY,
} from '@/domain/volatility';
import {
  HIST_REAL_SOURCES,
  HIST_REAL_START_YEAR,
  HIST_REAL_END_YEAR,
} from '@/domain/historicalReturns';
import {
  CAPITAL_GAINS_FLAT,
  GAINS_INCLUSION,
  TAX_TABLES_YEAR,
  TAX_TABLE_SOURCES,
  US_LTCG_BRACKETS,
  US_NIIT,
  WITHHOLDING,
} from '@/domain/taxTables';
import { bracketsFor } from '@/domain/tax';
import { ASSET_CLASSES } from '@/domain/assetClass';
import { DEFAULT_PROVINCE, PROVINCE_LABEL, type Country } from '@/domain/country';

const pct = (n: number): string => `${n}%`;

type MethodologyView = 'projection' | 'montecarlo';

export const MethodologyPage = () => {
  const { plan, rates, projection } = usePlanContext();
  const { t } = useTranslation();
  const [view, setView] = useState<MethodologyView>('projection');

  const startYear = new Date().getFullYear();
  const { currentAge, lifeExpectancyAge } = plan.settings;
  const endYear = lifeExpectancyYear(currentAge, startYear, lifeExpectancyAge);
  const horizonYears = Math.max(1, endYear - startYear);
  const model = plan.settings.monteCarloModel ?? 'bootstrap';
  const hasBtc = plan.holdings.some((h) => isBitcoinSymbol(h.instrument.symbol));
  const btcCycle = (plan.settings.btcHalvingCycle ?? false) && hasBtc;
  const residence = plan.residenceCountry ?? 'US';
  const iterations = plan.settings.monteCarloIterations ?? DEFAULT_MC_OPTIONS.iterations;

  // The per-holding drift / sigma the engine will actually use for THIS plan —
  // built from the same function the Monte Carlo lens uses, so the numbers match.
  const mcAssets = useMemo(
    () =>
      plan.holdings.length > 0
        ? buildMonteCarloInput(plan, rates, startYear, horizonYears).assets
        : [],
    [plan, rates, startYear, horizonYears],
  );

  const province = plan.residenceProvince ?? DEFAULT_PROVINCE;
  const brackets = bracketsFor(residence, province);
  const bracketsLabel =
    residence === 'CA'
      ? `${t(`country.${residence}`, residence)} · ${PROVINCE_LABEL[province]}`
      : residence;
  const tickerRows = Object.entries(TICKER_VOLATILITY);

  return (
    <ErrorBoundary feature="methodology">
      <div className="methodology">
        <header className="section-head">
          <h2 className="section__title">{t('methodology.title')}</h2>
          <p className="section__desc">{t('methodology.intro')}</p>
        </header>

        {/* A. Guiding principle -------------------------------------------------- */}
        <section className="method-block">
          <div className="wo-section-label">{t('methodology.principleHeading')}</div>
          <p className="section__desc">{t('methodology.principleBody')}</p>
          <Formula tex={'g_{\\text{eff}} = g_{\\text{base}} + \\Delta_{\\text{scenario}}'} />
          <p className="field__hint">
            {t('methodology.scenarioNote', {
              down: DEFAULT_SCENARIO_CONFIG.conservativeAdjustmentPts,
              up: DEFAULT_SCENARIO_CONFIG.optimisticAdjustmentPts,
            })}
          </p>
        </section>

        {/* View toggle: Projection vs Monte Carlo -------------------------------- */}
        <div
          className="radio-row method-view-toggle"
          role="radiogroup"
          aria-label={t('methodology.viewToggleLabel')}
        >
          <label className="radio">
            <input
              type="radio"
              name="methodology-view"
              value="projection"
              checked={view === 'projection'}
              onChange={() => setView('projection')}
            />
            {t('methodology.viewProjection')}
          </label>
          <label className="radio">
            <input
              type="radio"
              name="methodology-view"
              value="montecarlo"
              checked={view === 'montecarlo'}
              onChange={() => setView('montecarlo')}
            />
            {t('methodology.viewMonteCarlo')}
          </label>
        </div>

        {/* B. Deterministic projection ----------------------------------------- */}
        {view === 'projection' && (
          <section className="method-block">
            <div className="wo-section-label">{t('methodology.detHeading')}</div>
            <p className="section__desc">{t('methodology.detIntro')}</p>

            <p className="field__hint">{t('methodology.detGrowth')}</p>
            <Formula tex={'V_{t+1} = V_t \\,\\bigl(1 + g_{\\text{eff}}\\bigr)'} />

            <p className="field__hint">{t('methodology.detContrib')}</p>
            <Formula
              tex={
                '\\text{FV} = c \\cdot \\frac{(1 + r_m)^{12} - 1}{r_m}, \\qquad r_m = (1 + g_{\\text{eff}})^{1/12} - 1'
              }
            />

            <p className="field__hint">{t('methodology.detInflation')}</p>
            <Formula
              tex={'f_t = (1 + i)^{\\,t}, \\qquad N_t = S \\cdot f_t \\cdot m_{\\text{phase}}'}
            />

            <p className="field__hint">{t('methodology.detGrossUp')}</p>
            <Formula
              tex={
                '\\text{gross} = \\frac{\\text{net}}{1 - e}, \\qquad e = \\max(\\text{rate},\\ \\text{withholding})'
              }
            />

            <p className="field__hint">{t('methodology.detProgressive')}</p>
            <Formula
              tex={
                '\\text{tax}(x) = \\sum_k \\tau_k \\,\\bigl[\\min(x, s_k) - s_{k-1}\\bigr]^{+}, \\qquad s_k \\mapsto s_k \\cdot f_t'
              }
            />

            <InfoPanel title={t('calc.title')}>
              <CalculationDetailsContent plan={plan} projection={projection.active} />
            </InfoPanel>
          </section>
        )}

        {/* Tax tables — shared by both engines, shown under the Projection view */}
        {view === 'projection' && (
          <section className="method-block">
            <div className="wo-section-label">{t('methodology.taxHeading')}</div>
            <p className="field__hint">
              {t('methodology.taxVintage', {
                year: TAX_TABLES_YEAR,
                source: TAX_TABLE_SOURCES[residence as Country],
              })}
            </p>

            {/* Cost-basis ratio method (directive 2) */}
            <p className="field__hint">{t('methodology.taxBasisMethod')}</p>
            <Formula
              tex={'\\text{gain} = \\frac{V - B}{V}, \\qquad \\text{taxable} = X \\cdot (1 - B/V)'}
            />
            <Formula
              tex={
                'B_{t+1} = B_t + \\text{contributions} - \\text{withdrawn} \\cdot \\frac{B_t}{V_t} \\quad(\\text{growth never raises } B)'
              }
            />

            <p className="field__hint">{t('methodology.taxIntro', { residence: bracketsLabel })}</p>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>{t('methodology.colBracketUpTo')}</th>
                    <th>{t('methodology.colRate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {brackets.map((b, i) => (
                    <tr key={i}>
                      <td>{Number.isFinite(b.upTo) ? b.upTo.toLocaleString() : '∞'}</td>
                      <td>{(Math.round(b.rate * 1000) / 10).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* US LTCG ladder + NIIT */}
            {residence === 'US' && (
              <>
                <p className="field__hint">{t('methodology.taxLtcgHeading')}</p>
                <Formula
                  tex={
                    '\\text{cg} = L(o + g) - L(o) \\;+\\; 0.038 \\cdot \\max(0,\\ \\min(g,\\ o + g - 200{,}000))'
                  }
                />
                <div className="mc-table-wrap">
                  <table className="mc-table">
                    <thead>
                      <tr>
                        <th>{t('methodology.colBracketUpTo')}</th>
                        <th>{t('methodology.colRate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {US_LTCG_BRACKETS.map((b, i) => (
                        <tr key={i}>
                          <td>{Number.isFinite(b.upTo) ? b.upTo.toLocaleString() : '∞'}</td>
                          <td>{pct(Math.round(b.rate * 100))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="field__hint">
                  {t('methodology.taxNiitLine', {
                    rate: Math.round(US_NIIT.rate * 1000) / 10,
                    threshold: US_NIIT.threshold.toLocaleString(),
                  })}
                </p>
              </>
            )}

            <p className="field__hint">
              {t('methodology.taxOther', {
                cg: Math.round(CAPITAL_GAINS_FLAT[residence as Country] * 1000) / 10,
                incl: Math.round(GAINS_INCLUSION[residence as Country] * 100),
                wh: Math.round(WITHHOLDING[residence as Country].taxable * 1000) / 10,
              })}
            </p>
            {residence === 'CA' && (
              <p className="field__hint">{t('methodology.taxProvinceNote')}</p>
            )}
            <p className="field__hint">{t('methodology.taxAssumptions')}</p>
          </section>
        )}

        {/* C. Monte Carlo ------------------------------------------------------- */}
        {view === 'montecarlo' && (
          <section className="method-block">
            <div className="wo-section-label">{t('methodology.mcHeading')}</div>
            <p className="section__desc">{t('methodology.mcIntro')}</p>

            <p className="field__hint">{t('methodology.mcGbm')}</p>
            <Formula
              tex={
                '\\log r_t = \\mu - \\kappa\\, d_t + \\sigma\\,\\varepsilon_t \\;\\; (+\\,\\text{crash} + \\text{cycle}), \\qquad \\text{factor}_t = e^{\\log r_t}'
              }
            />
            <p className="field__hint">
              {t('methodology.mcCap', {
                min: MODEL_PARAMS.returnCapMinPct,
                max: MODEL_PARAMS.returnCapMaxPct,
              })}
            </p>
            <Formula tex={'\\log r_t \\in \\bigl[\\ln 0.05,\\ \\ln 3\\bigr]'} />

            <p className="field__hint">{t('methodology.mcCentering')}</p>
            <Formula
              tex={
                '\\mu = \\ln(1 + g) \\;\\Rightarrow\\; \\operatorname{median}(\\text{factor}) = 1 + g'
              }
            />
            <p className="field__hint">{t('methodology.mcCenteringNote')}</p>
            <Formula
              tex={'\\mathbb{E}[\\text{factor}] = (1 + g)\\,e^{\\sigma^{2}/2} \\;>\\; 1 + g'}
            />

            <p className="field__hint">{t('methodology.mcReversion')}</p>
            <Formula tex={'d_{t+1} = d_t + (\\log r_t - \\mu), \\qquad \\kappa = 0.15'} />

            <p className="field__hint">{t('methodology.mcNormal')}</p>
            <Formula tex={'\\varepsilon = \\sqrt{-2 \\ln u_1}\\,\\cos(2\\pi u_2)'} />

            <p className="field__hint">
              {t('methodology.mcStudent', { df: MODEL_PARAMS.studentTDf })}
            </p>
            <Formula
              tex={
                't_\\nu = \\frac{z}{\\sqrt{\\chi^2_\\nu / \\nu}} \\sqrt{\\frac{\\nu - 2}{\\nu}}, \\qquad \\nu = 5'
              }
            />

            <p className="field__hint">{t('methodology.mcCholesky')}</p>
            <Formula tex={'\\Sigma = L L^{\\top}, \\qquad \\varepsilon = L\\,z'} />

            <p className="field__hint">
              {t('methodology.mcCrash', {
                prob: Math.round(MODEL_PARAMS.crashProb * 100),
                vol: MODEL_PARAMS.crashVolMult,
                drift: Math.round(MODEL_PARAMS.crashDrift * 100),
                floor: MODEL_PARAMS.crashCorrFloor,
              })}
            </p>
            <Formula
              tex={
                "\\rho'_{ij} = \\max\\!\\bigl(\\rho_{ij},\\ \\rho_{\\text{floor}} \\cdot \\min(\\beta_i, \\beta_j)\\bigr)"
              }
            />

            <p className="field__hint">{t('methodology.mcSuccess')}</p>
            <Formula
              tex={`p = \\frac{\\#\\{\\text{funded paths}\\}}{N}, \\qquad N = ${iterations.toLocaleString('en-US').replace(/,/g, '\\,')}`}
            />

            <InfoPanel title={t('mc.aboutSimulation')}>
              {mcAssets.length > 0 ? (
                <SimulationMethodology assets={mcAssets} model={model} btcCycle={btcCycle} />
              ) : (
                <p className="field__hint">{t('methodology.noHoldings')}</p>
              )}
            </InfoPanel>
          </section>
        )}

        {/* D. Assumptions & data sources --------------------------------------- */}
        {view === 'montecarlo' && (
          <section className="method-block">
            <div className="wo-section-label">{t('methodology.assumpHeading')}</div>
            <p className="section__desc">{t('methodology.assumpIntro')}</p>

            {/* Volatility applied to THIS plan's holdings */}
            {mcAssets.length > 0 && (
              <>
                <p className="field__hint">{t('methodology.volApplied')}</p>
                <div className="mc-table-wrap">
                  <table className="mc-table">
                    <thead>
                      <tr>
                        <th>{t('methodology.colAsset')}</th>
                        <th>{t('methodology.colClass')}</th>
                        <th>{t('methodology.colDrift')}</th>
                        <th>{t('methodology.colSigma')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mcAssets.map((a, i) => (
                        <tr key={a.holdingId ?? i}>
                          <td>{a.symbol ?? `#${i + 1}`}</td>
                          <td>{a.assetClass ? t(`assetClass.${a.assetClass}`) : '—'}</td>
                          <td>{a.driftPct.toFixed(1)}%</td>
                          <td>±{Math.round(a.sigmaPct)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Default volatility by class + ticker overrides */}
            <p className="field__hint">{t('methodology.volDefaults')}</p>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>{t('methodology.colClass')}</th>
                    <th>{t('methodology.colSigma')}</th>
                    <th>{t('methodology.colCrashBeta')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ASSET_CLASSES.map((c) => (
                    <tr key={c}>
                      <td>{t(`assetClass.${c}`)}</td>
                      <td>±{CLASS_VOLATILITY[c]}%</td>
                      <td>×{CLASS_CRASH_BETA[c]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field__hint">{t('methodology.tickerOverrides')}</p>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>{t('methodology.colTicker')}</th>
                    <th>{t('methodology.colSigma')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tickerRows.map(([sym, v]) => (
                    <tr key={sym}>
                      <td>{sym}</td>
                      <td>±{v}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Correlation matrix */}
            <p className="field__hint">{t('methodology.corrIntro')}</p>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th></th>
                    {ASSET_CLASSES.map((c) => (
                      <th key={c}>{t(`assetClass.${c}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ASSET_CLASSES.map((r) => (
                    <tr key={r}>
                      <td>{t(`assetClass.${r}`)}</td>
                      {ASSET_CLASSES.map((c) => (
                        <td key={c}>{CLASS_CORRELATION[r][c].toFixed(2)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Historical data sources */}
            <p className="field__hint">
              {t('methodology.histSources', {
                from: HIST_REAL_START_YEAR,
                to: HIST_REAL_END_YEAR,
              })}
            </p>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>{t('method.realClassInput')}</th>
                    <th>{t('method.realSource')}</th>
                  </tr>
                </thead>
                <tbody>
                  {HIST_REAL_SOURCES.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td>{s.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Withdrawals in each simulated year are taxed with the same code path
              as the deterministic projection — see the Projection view for the
              tax tables, rather than repeating them here. */}
            <p className="field__hint">{t('methodology.taxSeeProjection')}</p>
          </section>
        )}

        {/* E. Limits & disclaimer ---------------------------------------------- */}
        <section className="method-block">
          <div className="wo-section-label">{t('methodology.limitsHeading')}</div>
          <ul className="section__desc method-limits">
            {view === 'montecarlo' && (
              <>
                <li>{t('methodology.limitCentering')}</li>
                <li>{t('methodology.limitDefaults')}</li>
                <li>{t('methodology.limitCaps')}</li>
              </>
            )}
            {view === 'projection' && <li>{t('methodology.limitTax')}</li>}
          </ul>
          <p className="disclaimer">
            <b>{t('plan.disclaimerLabel')}</b> {t('methodology.disclaimer')}
          </p>
        </section>
      </div>
    </ErrorBoundary>
  );
};
