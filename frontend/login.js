const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const authMessage = document.getElementById("authMessage");

loginTab.addEventListener("click", function() {

    loginTab.classList.add("active");
    signupTab.classList.remove("active");

    loginForm.style.display = "block";
    signupForm.style.display = "none";

    authMessage.textContent = "";

});

loginForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const email =
        document.getElementById("loginEmail").value;

    const password =
        document.getElementById("loginPassword").value;

    try {

        const response = await fetch(
            "http://localhost:3000/login",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            }
        );

        const result = await response.json();

        authMessage.textContent = result.message;

        if (response.ok) {

            localStorage.setItem(
                "user",
                JSON.stringify(result.user)
            );

            setTimeout(() => {
                window.location.href = "index.html";
            }, 800);
        }

    } catch (error) {

        console.error("Login error:", error);

        authMessage.textContent =
            "Unable to connect to server.";

    }

});

signupTab.addEventListener("click", function() {

    signupTab.classList.add("active");
    loginTab.classList.remove("active");

    signupForm.style.display = "block";
    loginForm.style.display = "none";

    authMessage.textContent = "";

});


signupForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const name = document.getElementById("signupName").value;
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;

    try {

        const response = await fetch(
            "http://localhost:3000/signup",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name: name,
                    email: email,
                    password: password
                })
            }
        );

        const result = await response.json();

        authMessage.textContent = result.message;

        if (response.ok) {
            signupForm.reset();

            setTimeout(() => {
                loginTab.click();
            }, 1000);
        }

    } catch (error) {

        console.error("Signup error:", error);

        authMessage.textContent =
            "Unable to connect to server.";

    }

});