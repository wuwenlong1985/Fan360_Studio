import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#25d9ff',
          colorInfo: '#25d9ff',
          colorBgBase: '#05090f',
          colorBgContainer: '#0d151f',
          colorBorder: '#203143',
          borderRadius: 10,
          fontFamily:
            'Inter, "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif',
        },
        components: {
          Layout: {
            headerBg: 'rgba(8, 15, 24, 0.94)',
            siderBg: '#09111b',
            bodyBg: '#05090f',
          },
          Card: {
            colorBgContainer: '#0d151f',
          },
          Segmented: {
            itemSelectedBg: '#17384b',
            itemSelectedColor: '#8feaff',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
)
