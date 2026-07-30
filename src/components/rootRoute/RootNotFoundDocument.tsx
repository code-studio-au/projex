import { RootNotFoundComponent } from '../routerErrors';
import { RootProviders } from '../../layouts';
import Document from './Document';

export default function RootNotFoundDocument() {
  return (
    <Document>
      <RootProviders>
        <RootNotFoundComponent />
      </RootProviders>
    </Document>
  );
}
