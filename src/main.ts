import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { storeReady } from './composables/useStartpage'
import { listenForApp } from './composables/useAutoSort'
import './style.css'

// The router's first navigation decides between the page and the setup, so it waits for synced links.
storeReady.then(() => {
  createApp(App).use(router).mount('#app')
  listenForApp()
})
