import { useTranslation } from 'react-i18next';
import { ASSET_CLASSES, type AssetClass } from '@/domain/assetClass';
import { type MonteCarloModel } from '@/domain/retirementSettings';
import { BTC_CYCLE_INFO, MODEL_PARAMS, isBitcoinSymbol } from '@/services/monteCarlo';
import { CLASS_HISTORY } from '@/domain/volatility';
import {
  HIST_REAL_END_YEAR,
  HIST_REAL_INFLATION,
  HIST_REAL_LEN,
  HIST_REAL_RETURN,
  HIST_REAL_SOURCES,
  HIST_REAL_START_YEAR,
} from '@/domain/historicalReturns';

/** A few canonical "bad cohort" years to make the real-history model concrete. */
const STRESS_YEARS = [1929, 1931, 1937, 1966, 1973, 1974, 1981, 2008, 2022] as const;

interface AssetSummary {
  readonly symbol?: string;
  readonly assetClass?: string;
  readonly driftPct: number;
  readonly sigmaPct: number;
}

interface Props {
  assets: readonly AssetSummary[];
  model: MonteCarloModel;
  btcCycle: boolean;
}

const toClass = (c: string | undefined): AssetClass =>
  c && (ASSET_CLASSES as readonly string[]).includes(c) ? (c as AssetClass) : 'other';

const histPct = (r: number): string => `${r >= 0 ? '+' : ''}${Math.round(r * 100)}%`;

const PHASE_KEY = [
  'method.phaseHalving',
  'method.phaseBull',
  'method.phaseBear',
  'method.phaseRecovery',
];

/**
 * Methodology / transparency block: how the selected model actually draws returns
 * (its parameters and, for bootstrap, the embedded historical series), the
 * universal return cap, and the optional Bitcoin halving overlay. Rendered inline
 * inside the "simulation data" panel so everything that drove the run lives under a
 * single toggle. Read-only. The per-asset inputs and correlation matrix are shown
 * by the panel itself, so they are not repeated here.
 */
export const SimulationMethodology = ({ assets, model, btcCycle }: Props) => {
  const { t } = useTranslation();
  const classes = Array.from(new Set(assets.map((a) => toClass(a.assetClass))));
  const years = CLASS_HISTORY.us_equity.map((_, i) => MODEL_PARAMS.historyStartYear + i);
  const btcAssets = assets.filter((a) => isBitcoinSymbol(a.symbol));

  return (
    <>
      <div className="wo-section-label">
        {t('method.heading', { model: t(`modelName.${model}`) })}
      </div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        {t('method.intro')}
      </p>
      {model === 'normal' && (
        <p className="field__hint" style={{ marginTop: 0 }}>
          {t('method.normal')}
        </p>
      )}
      {model === 'fat-tails' && (
        <p className="field__hint" style={{ marginTop: 0 }}>
          {t('method.fatTails', { df: MODEL_PARAMS.studentTDf })}
        </p>
      )}
      {model === 'crash-aware' && (
        <div className="mc-table-wrap">
          <table className="mc-table">
            <tbody>
              <tr>
                <td>{t('method.crashRowTails')}</td>
                <td>ν = {MODEL_PARAMS.studentTDf}</td>
              </tr>
              <tr>
                <td>{t('method.crashRowProb')}</td>
                <td>{Math.round(MODEL_PARAMS.crashProb * 100)}%</td>
              </tr>
              <tr>
                <td>{t('method.crashRowVol')}</td>
                <td>×{MODEL_PARAMS.crashVolMult}</td>
              </tr>
              <tr>
                <td>{t('method.crashRowShock')}</td>
                <td>
                  {t('method.crashShockValue', { pct: Math.round(MODEL_PARAMS.crashDrift * 100) })}
                </td>
              </tr>
              <tr>
                <td>{t('method.crashRowCorr')}</td>
                <td>
                  {t('method.crashCorrValue', { value: MODEL_PARAMS.crashCorrFloor.toFixed(2) })}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="field__hint">{t('method.crashNote')}</p>
        </div>
      )}
      {model === 'bootstrap' && (
        <>
          <p className="field__hint" style={{ marginTop: 0 }}>
            {t('method.bootstrapIntro', {
              block: MODEL_PARAMS.bootstrapBlock,
              from: MODEL_PARAMS.historyStartYear,
              to: years[years.length - 1],
            })}
          </p>
          <div className="mc-table-wrap mc-table-wrap--tall">
            <table className="mc-table">
              <thead>
                <tr>
                  <th>{t('method.colYear')}</th>
                  {classes.map((c) => (
                    <th key={c}>{t(`assetClass.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {years.map((yr, i) => (
                  <tr key={yr}>
                    <td>{yr}</td>
                    {classes.map((c) => {
                      const r = CLASS_HISTORY[c][i] ?? 0;
                      return (
                        <td key={c} className={r < 0 ? 'mc-neg' : 'mc-pos'}>
                          {histPct(r)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field__hint">{t('method.bootstrapNote')}</p>
        </>
      )}
      {model === 'historical-real-centered' && (
        <>
          <p className="field__hint" style={{ marginTop: 0 }}>
            {t('method.realCenteredIntro', {
              from: HIST_REAL_START_YEAR,
              to: HIST_REAL_END_YEAR,
              len: HIST_REAL_LEN,
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
          <p className="field__hint" style={{ marginBottom: 0 }}>
            {t('method.realStressCaption')}
          </p>
          <div className="mc-table-wrap">
            <table className="mc-table">
              <thead>
                <tr>
                  <th>{t('method.colYear')}</th>
                  <th>{t('method.colStocks')}</th>
                  <th>{t('method.colBonds')}</th>
                  <th>{t('method.colInflation')}</th>
                </tr>
              </thead>
              <tbody>
                {STRESS_YEARS.map((yr) => {
                  const i = yr - HIST_REAL_START_YEAR;
                  const stk = HIST_REAL_RETURN.us_equity[i] ?? 0;
                  const bnd = HIST_REAL_RETURN.other[i] ?? 0;
                  const inf = HIST_REAL_INFLATION[i] ?? 0;
                  return (
                    <tr key={yr}>
                      <td>{yr}</td>
                      <td className={stk < 0 ? 'mc-neg' : 'mc-pos'}>{histPct(stk)}</td>
                      <td className={bnd < 0 ? 'mc-neg' : 'mc-pos'}>{histPct(bnd)}</td>
                      <td className={inf < 0 ? 'mc-neg' : 'mc-pos'}>{histPct(inf)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="field__hint">{t('method.realNote', { to: HIST_REAL_END_YEAR })}</p>
        </>
      )}

      {btcCycle && btcAssets.length > 0 && (
        <>
          <div className="wo-section-label">{t('method.btcHeading')}</div>
          <p className="field__hint" style={{ marginTop: 0 }}>
            {t('method.btcIntro', {
              symbols: btcAssets.map((a) => a.symbol).join(', '),
              year: BTC_CYCLE_INFO.baseYear,
              damping: BTC_CYCLE_INFO.damping,
            })}
          </p>
          <div className="mc-table-wrap">
            <table className="mc-table">
              <thead>
                <tr>
                  <th>{t('method.btcColPhase')}</th>
                  <th>{t('method.btcColExampleYear')}</th>
                  <th>{t('method.btcColDrift')}</th>
                  <th>{t('method.btcColVol')}</th>
                </tr>
              </thead>
              <tbody>
                {PHASE_KEY.map((labelKey, p) => (
                  <tr key={labelKey}>
                    <td>{t(labelKey)}</td>
                    <td>{BTC_CYCLE_INFO.baseYear + p}</td>
                    <td className={BTC_CYCLE_INFO.offsets[p]! < 0 ? 'mc-neg' : 'mc-pos'}>
                      {BTC_CYCLE_INFO.offsets[p]! >= 0 ? '+' : ''}
                      {BTC_CYCLE_INFO.offsets[p]!.toFixed(2)}
                    </td>
                    <td>×{BTC_CYCLE_INFO.volMults[p]!.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};
