import { actions, t } from '../store';

export function About() {
  return (
    <>
      <div className="screen-head">
        <h1>{t('about.title')}</h1>
        <p>{t('app.tagline')}</p>
      </div>
      <div className="two">
        <div className="stack">
          <section className="card prose">
            <h2>{t('about.is')}</h2>
            <p>{t('about.isBody')}</p>
            <h2>{t('about.isNot')}</h2>
            <p>{t('about.isNotBody')}</p>
            <p>
              <button type="button" className="btn btn-quiet" onClick={() => actions.openDialog('safety')}>
                {t('set.safety')}
              </button>
            </p>
          </section>
          <section className="card prose">
            <h2>{t('about.privacy')}</h2>
            <p>{t('about.privacyBody')}</p>
            <h2>{t('about.license')}</h2>
            <p>{t('about.licenseBody')}</p>
            <p className="help">
              <span className="num">{t('about.version', { v: __APP_VERSION__ })}</span> · {t('about.by')}
            </p>
          </section>
        </div>
        <div className="stack">
          <section className="card prose">
            <h2>{t('about.evidence')}</h2>
            <ul>
              <li>{t('about.evidence.1')}</li>
              <li>{t('about.evidence.2')}</li>
              <li>{t('about.evidence.3')}</li>
            </ul>
            <p className="help">{t('about.evidence.strength')}</p>
          </section>
          <section className="card prose">
            <h2>{t('about.shortcuts')}</h2>
            <ul>
              <li>
                <span className="kbd">Space</span> {t('about.sc.space').replace(/^[^:]*:\s*/, '')}
              </li>
              <li>
                <span className="kbd">←</span> <span className="kbd">→</span> {t('about.sc.arrows').replace(/^[^:]*:\s*/, '')}
              </li>
              <li>
                <span className="kbd">[</span> <span className="kbd">]</span> {t('about.sc.brackets').replace(/^[^:]*:\s*/, '')}
              </li>
              <li>
                <span className="kbd">1</span>–<span className="kbd">5</span> {t('presets.title')}
              </li>
              <li>
                <span className="kbd">Esc</span> {t('about.sc.esc').replace(/^[^:]*:\s*/, '')}
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
