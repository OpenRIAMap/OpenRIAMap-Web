import FeatureSharePanel from '@/components/Rules/share/FeatureSharePanel';
import type { FeatureSharePayload } from '@/lib/featureShareLink';

type Props = {
  payload: FeatureSharePayload;
};

export default function MobileFeatureSharePanel({ payload }: Props) {
  return <FeatureSharePanel payload={payload} embedded />;
}
