import type { Metadata } from 'next'
import { FileViewer } from './file-viewer'

export const metadata: Metadata = {
  title: '文件',
  robots: { index: false },
}

export default FileViewer
