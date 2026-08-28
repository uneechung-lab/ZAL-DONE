import React, { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', fontFamily: 'sans-serif', backgroundColor: '#fff1f2', color: '#9f1239', height: '100vh', boxSizing: 'border-box' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>🚨 런타임 오류가 발생했습니다</h2>
          <pre style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #fecdd3', fontSize: '13px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            {'\n\n'}
            {this.state.error && this.state.error.stack}
          </pre>
          <button 
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{ marginTop: '16px', padding: '8px 16px', backgroundColor: '#e11d48', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}
          >
            로컬 캐시 초기화 후 새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
