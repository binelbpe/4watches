let timeLeft = 30;
let countdown;

function initializeTimer() {
  const otpTimer = document.getElementById('otpTimer');
  const otpInput = document.getElementById('otp');
  const submitButton = document.querySelector('button[type="submit"]');
  const timerContainer = document.querySelector('.timer-container');
  
  // Clear any existing timer
  if (window.existingTimer) {
    clearInterval(window.existingTimer);
  }

  function updateTimer() {
    if (timeLeft <= 0) {
      clearInterval(countdown);
      if (timerContainer) {
        timerContainer.innerHTML = `
          <button onclick="handleResend()" 
                  class="text-[#bca374] hover:text-[#a38f5f] font-medium resend-button">
            Resend OTP
          </button>
        `;
      }
      if (otpInput) otpInput.disabled = true;
      if (submitButton) submitButton.disabled = true;
    } else {
      if (otpTimer) {
        otpTimer.textContent = timeLeft + 's';
        timeLeft--;
      }
    }
  }

  // Start timer
  timeLeft = 30;
  if (otpInput) otpInput.disabled = false;
  if (submitButton) submitButton.disabled = false;
  updateTimer();
  countdown = setInterval(updateTimer, 1000);
  window.existingTimer = countdown;
}

async function handleResend() {
  try {
    // Get the endpoint from window.RESEND_ENDPOINT
    const endpoint = window.RESEND_ENDPOINT || '/resendOTP';
    
    console.log("Sending request to:", endpoint); // Debug log
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        email: window.EMAIL,
        isSignup: endpoint === '/resendOTP'
      })
    });

    const data = await response.json();
    console.log("Response data:", data); // Debug log

    if (response.ok && data.success) {
      Swal.fire({
        title: 'OTP Sent!',
        text: 'New OTP has been sent to your phone',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });

      const timerContainer = document.querySelector('.timer-container');
      if (timerContainer) {
        timerContainer.innerHTML = `
          <div class="flex items-center justify-center space-x-2">
            <span class="text-gray-600">Resend OTP in</span>
            <span id="otpTimer" class="timer-text">30s</span>
          </div>
        `;
      }

      const otpInput = document.getElementById('otp');
      if (otpInput) {
        otpInput.value = '';
        otpInput.disabled = false;
      }

      const submitButton = document.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = false;

      initializeTimer();
    } else {
      throw new Error(data.message || 'Failed to resend OTP');
    }
  } catch (error) {
    console.error('Failed to resend OTP:', error);
    Swal.fire({
      title: 'Error!',
      text: error.message || 'Failed to send OTP. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  }
}

// Initialize timer on page load
document.addEventListener('DOMContentLoaded', initializeTimer); 