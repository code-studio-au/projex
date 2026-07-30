import { RootErrorComponent } from '../routerErrors';
import { RootProviders } from '../../layouts';
import Document from './Document';

export default function RootErrorDocument(props: { error: unknown }) {
  return (
    <Document>
      <RootProviders>
        <RootErrorComponent {...props} />
      </RootProviders>
    </Document>
  );
}
