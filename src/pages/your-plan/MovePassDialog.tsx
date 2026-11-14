import { Icon, Modal } from '../../shared/ui';
import './MovePassDialog.css';

/** Same proposition used in the local V2/V1 handoff; this is not a purchase. */
export const movePassOffer = {
  version: 'MOVEPASS-V1-2026-11-15',
  description: 'A proposed $9.99 one-time upgrade for managing one move: record actual payment amounts and dates, see how those payments change your remaining cash, and track your old deposit separately until it is returned.',
};

export function MovePassDialog({ onClose, onDemo }: { onClose: () => void; onDemo: () => void }) {
  return <Modal title="Keep your moving plan up to date." onClose={onClose}>
    <div className="mg-pass">
      <p className="mg-pass-intro">{movePassOffer.description}</p>
      <div className="mg-pass-price"><strong>$9.99</strong><span>Proposed one-time price · no subscription</span></div>
      <section aria-label="Free planning"><h3>Always outside the paid offer</h3><p>Calculations, draft protection, online saving, and access to your data do not require a Move Pass. Online saving is not connected in this build.</p></section>
      <section aria-label="Available in the free demo"><h3>Working in the free demo</h3><ul>
        <li><Icon name="check" size={17}/>Track planned and actual payment dates and amounts.</li>
        <li><Icon name="check" size={17}/>See how recorded payments change your available cash.</li>
        <li><Icon name="check" size={17}/>Track your old deposit separately until it is returned.</li>
      </ul></section>
      <div className="mg-pass-demo"><strong>Free demo — no purchase or payment.</strong><p>Try the working payment tracker and save your plan in this browser. No card is needed and no money is collected. Payments and paid access are not connected.</p><p>We are testing whether this workflow is worth a one-time price. These features are available in the demo; there is no separate paid-only feature yet.</p></div>
      <button className="button primary full-width" onClick={onDemo}>Use the free demo<Icon name="arrow" size={17}/></button>
      <button className="mg-pass-back" onClick={onClose}>Back to my plan</button>
    </div>
  </Modal>;
}
