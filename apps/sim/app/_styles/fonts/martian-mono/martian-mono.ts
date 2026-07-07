import localFont from 'next/font/local'

/**
 * Martian Mono font configuration
 * Monospaced variable font used for code snippets, technical content, and accent text
 * on the landing page. Supports weights 100-800.
 */
export const martianMono = localFont({
  src: [
    { path: './files/2V0PKIcADoYhV6w87xrTKjs4CYElh_VS9YA4TlTnaTe9wWmm.woff2', weight: '100 800', style: 'normal' },
    { path: './files/2V0PKIcADoYhV6w87xrTKjs4CYElh_VS9YA4TlTnaT69wWmm.woff2', weight: '100 800', style: 'normal' },
    { path: './files/2V0PKIcADoYhV6w87xrTKjs4CYElh_VS9YA4TlTnaTS9wWmm.woff2', weight: '100 800', style: 'normal' },
    { path: './files/2V0PKIcADoYhV6w87xrTKjs4CYElh_VS9YA4TlTnaTq9wQ.woff2', weight: '100 800', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-martian-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
})
