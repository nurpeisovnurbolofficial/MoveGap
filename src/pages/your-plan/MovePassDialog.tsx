import { Icon, Modal } from '../../shared/ui';
import './MovePassDialog.css';

export function MovePassDialog({ onClose, onDemo }: { onClose: () => void; onDemo: () => void }) {
  return <Modal title="Keep your moving plan up to date." onClose={onClose}>
    <div className="mg-pass">
      <p className="mg-pass-intro">Compare your options for free. Move Pass is a proposed one-time upgrade for following your chosen plan as payments happen.</p>
      <div className="mg-pass-price"><strong>$9.99</strong><span>Proposed one-time price · no subscription</span></div>
      <section aria-label="Free planning"><h3>Free planning</h3><p>Enter your move, calculate your cash, and compare options. Draft saving and data recovery do not require a Move Pass.</p></section>
      <section aria-label="Move Pass features"><h3>An updateable payment plan</h3><ul>
        <li><Icon name="check" size={17}/>Track planned and actual payment dates and amounts.</li>
        <li><Icon name="check" size={17}/>See how recorded payments change your available cash.</li>
        <li><Icon name="check" size={17}/>Track your old deposit separately until it is returned.</li>
      </ul></section>
      <div className="mg-pass-demo"><strong>Free demo — no purchase or payment.</strong><p>Try the working payment tracker and save your plan in this browser. No card is needed and no money is collected. Payments and paid access are not connected; the price is a proposal.</p><p>Online saving, when available, is separate and does not require this upgrade.</p></div>
      <button className="button primary full-width" onClick={onDemo}>Use the free demo<Icon name="arrow" size={17}/></button>
      <button className="mg-pass-back" onClick={onClose}>Back to my plan</button>
    </div>
  </Modal>;
}
