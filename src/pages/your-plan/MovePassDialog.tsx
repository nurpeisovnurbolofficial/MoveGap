import { Icon, Modal } from '../../shared/ui';

export function MovePassDialog({ onClose, onDemo }: { onClose: () => void; onDemo: () => void }) {
  return <Modal title="Keep your move on track." onClose={onClose}>
    <p className="modal-intro">One Move Pass for the plan you will come back to.</p>
    <div className="pass-price">$9.99<span>proposed one-time price</span></div>
    <ul className="pass-features">
      <li><Icon name="check" size={18}/>An updateable plan saved in this browser</li>
      <li><Icon name="check" size={18}/>Planned and actual payments side by side</li>
      <li><Icon name="check" size={18}/>Old deposit return tracked separately</li>
    </ul>
    <div className="demo-disclosure"><strong>Hackathon demo - no payment collected.</strong><p>The price is a hypothesis. This free demo saves your plan in this browser. Payment processing, access expiry and cross-device sync are not connected.</p></div>
    <button className="button primary full-width" onClick={onDemo}>Try the full demo<Icon name="arrow" size={18}/></button>
  </Modal>;
}
