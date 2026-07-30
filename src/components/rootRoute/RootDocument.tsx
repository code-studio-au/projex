import { RootLayout, RootProviders } from '../../layouts';
import Document from './Document';

export default function RootDocument() {
  return (
    <Document>
      <RootProviders>
        <RootLayout />
      </RootProviders>
    </Document>
  );
}
