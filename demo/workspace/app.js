// CloudScale Portal Interactive Logic
document.addEventListener("DOMContentLoaded", () => {
  const primaryCta = document.getElementById("primary-cta");
  const loginBtn = document.getElementById("login-btn");

  if (primaryCta) {
    primaryCta.addEventListener("click", () => {
      alert("Welcome to CloudScale Portal! Governed AI Workspace ready.");
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      alert("Authentication portal active.");
    });
  }
});
