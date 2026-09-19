import '@ant-design/v5-patch-for-react-19'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#2475ed',
          colorInfo: '#2475ed',
          colorText: '#25354b',
          colorTextSecondary: '#7d899c',
          colorBgBase: '#f3f5f9',
          colorBgContainer: '#ffffff',
          colorBorder: '#e0e7f0',
          borderRadius: 7,
          controlHeight: 34,
          fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
        },
        components: {
          Button: {
            fontWeight: 500,
          },
          Card: {
            headerFontSize: 14,
          },
          Layout: {
            headerBg: '#ffffff',
            siderBg: '#ffffff',
            bodyBg: '#f3f5f9',
          },
          Segmented: {
            itemSelectedBg: '#eaf2ff',
            itemSelectedColor: '#2475ed',
          },
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
