// Latin subsets only, and only the three weights the UI actually uses. These are inlined into the
// single-file build, so the console makes no network request for them at any point.
import '@fontsource/geist-sans/latin-400.css'
import '@fontsource/geist-sans/latin-600.css'
import '@fontsource/geist-mono/latin-400.css'

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
