import { defineComponent, ref, onMounted } from 'vue'
import { api } from '@/api'
import logoUrl from '../../../../build/icon.png'

/**
 * AboutTab — centered hero with big logo, version info, runtime details, and links.
 */
export default defineComponent({
  name: 'AboutTab',

  props: {
    onClose: {
      type: Function,
      required: true,
    },
  },

  setup(props) {
    const info = ref<{ version: string; name: string; electron: string; chrome: string; node: string } | null>(null)

    onMounted(async () => {
      try {
        info.value = await api.settings.getAppVersion.query()
      } catch (err) {
        console.error('[AboutTab] Failed to load app info:', err)
      }
    })

    function openExternal(url: string) {
      props.onClose()
      api.system.openExternal.mutate({ url })
    }

    return { info, openExternal }
  },

  render() {
    return (
      <div class="about-page">
        {/* Hero section — centered vertically */}
        <div class="about-page__hero">
          <img class="about-page__logo" src={logoUrl} alt="Atlas" />
          <div class="about-page__name">Atlas</div>
          <div class="about-page__version">v{this.info?.version ?? '…'}</div>
          <div class="about-page__tagline">AI Desktop Agent</div>

          {/* Runtime pills inline  */}
          <div class="about-page__runtime">
            <span class="about-page__runtime-pill">
              Electron {this.info?.electron ?? '…'}
            </span>
            <span class="about-page__runtime-pill">
              Chromium {this.info?.chrome ?? '…'}
            </span>
            <span class="about-page__runtime-pill">
              Node {this.info?.node ?? '…'}
            </span>
          </div>
        </div>

        {/* Links row */}
        <div class="about-page__links">
          <button class="about-page__link" onClick={() => this.openExternal('https://github.com/dortanes/atlas')}>
            <span class="about-page__link-icon">code</span>
            Source Code
          </button>
          <button class="about-page__link" onClick={() => this.openExternal('https://github.com/dortanes/atlas/issues')}>
            <span class="about-page__link-icon">bug_report</span>
            Report Bug
          </button>
          <button class="about-page__link" onClick={() => this.openExternal('https://github.com/dortanes/atlas/releases')}>
            <span class="about-page__link-icon">new_releases</span>
            Releases
          </button>
        </div>
      </div>
    )
  },
})
