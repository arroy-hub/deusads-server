/** Payout / billing details: only a placeholder for now. Nothing here can be edited or saved. */
export default function BillingStub({ advertiser }) {
  const field = (label, full = false) => (
    <div className={full ? "full" : undefined} key={label}>
      <label>{label}</label>
      <input className="field" disabled placeholder="—" aria-disabled="true" />
    </div>
  );
  return (
    <div className="panel stub">
      <div className="stub-head">
        <div>
          <b>{advertiser ? "Billing details" : "Payout details"}</b>
          <span className="sub">{advertiser ? "Who we invoice." : "Where we send your earnings."}</span>
        </div>
        <span className="pill warn">Placeholder · coming soon</span>
      </div>
      <div className="stub-grid">
        {field("Legal name")}
        {field("Registration number")}
        {field("VAT ID")}
        {field(advertiser ? "Payment method" : "Payout method")}
        {field("Billing address", true)}
      </div>
    </div>
  );
}
