import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { storeReady } from './composables/useStartpage'
import { listenForApp } from './composables/useAutoSort'
import './style.css'
import './app-touch.css'
import { inApp } from './lib/inApp'

// In the iPhone app, links are tiles to tap (app-touch.css).
if (inApp) document.documentElement.classList.add('in-app')

// The router's first navigation decides between the page and the setup, so it waits for synced links.
storeReady.then(() => {
  createApp(App).use(router).mount('#app')
  listenForApp()
})
