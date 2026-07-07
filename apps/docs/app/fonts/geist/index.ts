import localFont from 'next/font/local'

export const inter = localFont({
  src: [
    { path: './files/gyByhwUxId8gMEwRGFWfOw.woff2', weight: '100 900', style: 'normal' },
    { path: './files/gyByhwUxId8gMEwYGFWfOw.woff2', weight: '100 900', style: 'normal' },
    { path: './files/gyByhwUxId8gMEwTGFWfOw.woff2', weight: '100 900', style: 'normal' },
    { path: './files/gyByhwUxId8gMEwSGFWfOw.woff2', weight: '100 900', style: 'normal' },
    { path: './files/gyByhwUxId8gMEwcGFU.woff2', weight: '100 900', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-geist-sans',
})

export const geistMono = localFont({
  src: [
    { path: '../geist-mono/or3nQ6H-1_WfwkMZI_qYFrodmgPn.woff2', weight: '100 900', style: 'normal' },
    { path: '../geist-mono/or3nQ6H-1_WfwkMZI_qYFrMdmgPn.woff2', weight: '100 900', style: 'normal' },
    { path: '../geist-mono/or3nQ6H-1_WfwkMZI_qYFg08vz7ehw.woff2', weight: '100 900', style: 'normal' },
    { path: '../geist-mono/or3nQ6H-1_WfwkMZI_qYFrgdmgPn.woff2', weight: '100 900', style: 'normal' },
    { path: '../geist-mono/or3nQ6H-1_WfwkMZI_qYFrkdmgPn.woff2', weight: '100 900', style: 'normal' },
    { path: '../geist-mono/or3nQ6H-1_WfwkMZI_qYFrcdmg.woff2', weight: '100 900', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-geist-mono',
})
