export function AdminAutomations() {
  return (
    <div className="admin-control-center">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Reloved operations</p>
          <h1>Automations</h1>
          <p className="admin-subtitle">
            Existing reminders and lifecycle messaging.
          </p>
        </div>
      </header>
      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Existing workflows</h2>
          <span className="admin-status is-neutral">Read-only inventory</span>
        </div>
        <dl className="admin-workflow-list">
          <div>
            <dt>Morning delivery digest</dt>
            <dd>
              Scheduled at 09:00 Asia/Kolkata. Emails operations when deliveries
              are due today.
            </dd>
          </div>
          <div>
            <dt>Lifecycle notifications</dt>
            <dd>
              Existing drop, claim and delivery transitions trigger configured
              email and SMS messages. Audit outcomes in Deliveries.
            </dd>
          </div>
        </dl>
        <p className="admin-panel-description">
          This inventory describes configured application behavior. Live
          provider health is not verified here. Workflow editing and new
          automations are not available.
        </p>
      </section>
    </div>
  )
}
