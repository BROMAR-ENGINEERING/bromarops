/* Dashboard page */
window.BromarPages = window.BromarPages || {};
window.BromarPages.dashboard = {
  title: 'Dashboard',
  render(container) {
    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Welcome to Bromar Ops</h1>
        <p class="subtitle">Operations management platform for Bromar Electrical Services</p>
      </div>
      <div class="card">
        <div class="section-label">Overview</div>
        <p>Select a module from the sidebar to get started.</p>
      </div>
    `;
  }
};
