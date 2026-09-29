// Inter is the design system's typeface, self-hosted through @fontsource (latin subset, the weights
// the UI uses) and inlined into the single-file build, so the console makes no network request for
// fonts. We never load it from Google Fonts, unlike the upstream tokens/fonts.css.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'

import { createApp } from 'vue'
import App from './App.vue'
import './ds/index.css'
import './style.css'

createApp(App).mount('#app')
