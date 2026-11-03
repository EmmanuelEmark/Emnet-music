function getToken() {
  return localStorage.getItem("emnetToken");
}

function getStoredUser() {
  const user = localStorage.getItem("emnetUser");

  if (!user) {
    return null;
  }

  try {
    return JSON.parse(user);
  } catch (error) {
    return null;
  }
}

function isLoggedIn() {
  return Boolean(getToken());
}

function logout() {
  localStorage.removeItem("emnetToken");
  localStorage.removeItem("emnetUser");

  window.location.href = "login.html";
}

async function getCurrentUser({ redirectOnFailure = true } = {}) {
  const token = getToken();

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/auth/me`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    
if (!response.ok) {

  // Clear invalid or expired authentication.
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("emnetToken");
    localStorage.removeItem("emnetUser");

    // Protected pages still redirect to login.
    if (redirectOnFailure) {
      window.location.href = "login.html";
    }
  }

  return null;
}


    const data = await response.json();

    const user = data.user || data;

    localStorage.setItem(
      "emnetUser",
      JSON.stringify(user)
    );

    return user;

  } catch (error) {
    console.error("Unable to get current user:", error);
    return null;
  }
}

function protectPage() {
  if (!isLoggedIn()) {
    window.location.href = "login.html";
    return false;
  }

  return true;
}

function requireRole(...allowedRoles) {
  const user = getStoredUser();

  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  if (!allowedRoles.includes(user.role)) {
    window.location.href = "home.html";
    return false;
  }

  return true;
}