import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App.jsx'
import './index.css'

dayjs.locale('zh-cn')

createRoot(document.getElementById('root')).render(
  <ConfigProvider
    locale={zhCN}
    theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6 } }}
  >
    <App />
  </ConfigProvider>
)
