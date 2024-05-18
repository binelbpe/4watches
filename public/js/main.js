// Function to toggle the filter sidebar
function toggleFilter() {
  var sidebar = document.getElementById("filterSidebar");
  sidebar.style.display = sidebar.style.display === "block" ? "none" : "block";
}

// Update price range display
document.getElementById("price-range").addEventListener("input", function () {
  var priceRange = parseInt(this.value);
  var priceDisplay = document.getElementById("price-display");
  switch (true) {
    case priceRange <= 5000:
      priceDisplay.textContent = "0 - 5000 Rs";
      break;
    case priceRange <= 10000:
      priceDisplay.textContent = "5001 - 10000 Rs";
      break;
    case priceRange <= 20000:
      priceDisplay.textContent = "10001 - 20000 Rs";
      break;
    case priceRange <= 30000:
      priceDisplay.textContent = "20001 - 30000 Rs";
      break;
    case priceRange <= 40000:
      priceDisplay.textContent = "30001 - 40000 Rs";
      break;
    case priceRange <= 50000:
      priceDisplay.textContent = "40001 - 50000 Rs";
      break;
    default:
      priceDisplay.textContent = "50001 and above Rs";
      break;
  }
});

// Client-side form validation for Login form
function validateLoginForm() {
  const emailValid = validateEmail("loginEmail", "loginEmailError");
  const passwordValid = validatePassword("loginPassword", "loginPasswordError");

  return emailValid && passwordValid;
}

// Client-side form validation for Signup form
function validateSignupForm() {
  const nameValid = validateName("signupName", "signupNameError");
  const emailValid = validateEmail("signupEmail", "signupEmailError");
  const passwordValid = validatePassword(
    "signupPassword",
    "signupPasswordError"
  );
  const phoneValid = validatePhone("signupPhone", "signupPhoneError");

  return nameValid && emailValid && passwordValid && phoneValid;
}

// Validation for Name field
function validateName(inputId, errorId) {
  const name = document.getElementById(inputId).value.trim();
  const errorElement = document.getElementById(errorId);

  if (name === "" || name.length < 3) {
    errorElement.textContent = "Name must be at least 3 characters long";
    return false;
  } else {
    errorElement.textContent = "";
    return true;
  }
}

// Validation for Email field
function validateEmail(inputId, errorId) {
  const email = document.getElementById(inputId).value.trim();
  const errorElement = document.getElementById(errorId);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    errorElement.textContent = "Invalid email format";
    return false;
  } else {
    errorElement.textContent = "";
    return true;
  }
}

// Validation for Password field
function validatePassword(inputId, errorId) {
  const password = document.getElementById(inputId).value.trim();
  const errorElement = document.getElementById(errorId);

  const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/;

  if (!passwordRegex.test(password)) {
    errorElement.textContent =
      "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number";
    return false;
  } else {
    errorElement.textContent = "";
    return true;
  }
}

// Validation for Phone field
function validatePhone(inputId, errorId) {
  const phone = document.getElementById(inputId).value.trim();
  const errorElement = document.getElementById(errorId);

  const phoneRegex = /^\d{10}$/;

  if (!phoneRegex.test(phone)) {
    errorElement.textContent = "Invalid phone number";
    return false;
  } else {
    errorElement.textContent = "";
    return true;
  }
}


