"use strict";

document.addEventListener("DOMContentLoaded", () => {
    setupScrollAnimations();
    setupMembershipActions();
    setupProductCart();
    setupAuthForms();
    setupAccount();
});

function setupScrollAnimations() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const groups = [
        { selector: "#inicio > div:last-child, #inicio h1, #inicio p, #inicio a", stagger: false },
        { selector: "#planes h2, #entrenadores h2, #rutinas h2, #productos h2, #contacto h2", stagger: false },
        { selector: "#planes > p, #entrenadores > p, #rutinas > p, #productos > p, #contacto > p:not(.dato-contacto)", stagger: false },
        { selector: "#planes article, #entrenadores article, #rutinas article, #productos article", stagger: true },
        { selector: "#contacto .dato-contacto", stagger: true }
    ];
    const elements = new Set();

    groups.forEach(({ selector, stagger }) => {
        document.querySelectorAll(selector).forEach((element, index) => {
            if (elements.has(element)) return;
            elements.add(element);
            element.classList.add("animar-entrada");
            if (stagger) element.style.setProperty("--retraso-entrada", `${(index % 4) * 90}ms`);
        });
    });

    if (!("IntersectionObserver" in window)) {
        elements.forEach((element) => element.classList.add("entrada-visible"));
        return;
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("entrada-visible");
            currentObserver.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });

    elements.forEach((element) => observer.observe(element));
}

function createStatusMessage(parent, className = "mensaje-interfaz") {
    const message = document.createElement("p");
    message.className = className;
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    parent.append(message);
    return message;
}

function setupMembershipActions() {
    const planCards = document.querySelectorAll("#planes article");

    planCards.forEach((card) => {
        const planName = card.querySelector("h3")?.textContent.trim();
        const priceBox = card.querySelector(".precio");
        if (!planName || !priceBox) return;

        const chooseLink = document.createElement("a");
        chooseLink.className = "plan-accion";
        chooseLink.href = `registro.html?plan=${encodeURIComponent(planName)}`;
        chooseLink.textContent = "Elegir este plan";
        priceBox.append(chooseLink);
    });
}

function setupProductCart() {
    const productSection = document.querySelector("#productos");
    if (!productSection) return;

    const cart = new Map();
    const cartButton = document.createElement("button");
    cartButton.className = "carrito-flotante";
    cartButton.type = "button";
    cartButton.setAttribute("aria-label", "Abrir carrito");
    cartButton.setAttribute("aria-expanded", "false");
    cartButton.setAttribute("aria-controls", "panel-carrito");
    cartButton.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L21 7H6"></path>
            <circle cx="9" cy="20" r="1.4"></circle>
            <circle cx="18" cy="20" r="1.4"></circle>
        </svg>
        <span class="carrito-contador" aria-live="polite">0</span>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "carrito-fondo";
    backdrop.hidden = true;

    const panel = document.createElement("aside");
    panel.className = "panel-carrito";
    panel.id = "panel-carrito";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "carrito-titulo");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
        <div class="carrito-encabezado">
            <div><p class="carrito-kicker">GYMFLOW STORE</p><h2 id="carrito-titulo">Tu carrito</h2></div>
            <button class="carrito-cerrar" type="button" aria-label="Cerrar carrito">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="m7 7 10 10M17 7 7 17"></path>
                </svg>
            </button>
        </div>
        <div class="carrito-items" aria-live="polite"></div>
        <div class="carrito-vacio"><span aria-hidden="true">🛒</span><h3>Tu carrito está vacío</h3><p>Agrega productos y aparecerán aquí.</p></div>
        <div class="carrito-pie" hidden>
            <div class="carrito-total"><span>Total</span><strong></strong></div>
            <button class="carrito-pagar" type="button">Continuar al pago</button>
            <p class="carrito-nota">El pago se habilitará cuando conectemos la plataforma.</p>
            <p class="carrito-feedback" role="status" aria-live="polite"></p>
        </div>
    `;
    document.body.append(backdrop, panel, cartButton);

    const countLabel = cartButton.querySelector(".carrito-contador");
    const itemList = panel.querySelector(".carrito-items");
    const emptyState = panel.querySelector(".carrito-vacio");
    const footer = panel.querySelector(".carrito-pie");
    const totalLabel = panel.querySelector(".carrito-total strong");
    const payButton = panel.querySelector(".carrito-pagar");
    const feedback = panel.querySelector(".carrito-feedback");
    const currency = new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0
    });

    const setPanelOpen = (open) => {
        panel.classList.toggle("carrito-abierto", open);
        backdrop.hidden = !open;
        cartButton.setAttribute("aria-expanded", String(open));
        panel.setAttribute("aria-hidden", String(!open));
        document.body.classList.toggle("carrito-bloqueo-scroll", open);
        if (open) panel.querySelector(".carrito-cerrar").focus();
        else cartButton.focus();
    };

    const renderCart = () => {
        const itemCount = [...cart.values()].reduce((sum, item) => sum + item.quantity, 0);
        const total = [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
        countLabel.textContent = String(itemCount);
        cartButton.setAttribute("aria-label", `Abrir carrito, ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`);
        emptyState.hidden = itemCount > 0;
        footer.hidden = itemCount === 0;
        itemList.replaceChildren();

        cart.forEach((item, name) => {
            const row = document.createElement("article");
            row.className = "carrito-item";

            const image = document.createElement("img");
            image.src = item.image;
            image.alt = "";

            const info = document.createElement("div");
            info.className = "carrito-item-info";
            const title = document.createElement("h3");
            title.textContent = name;
            const price = document.createElement("p");
            price.textContent = currency.format(item.price);
            info.append(title, price);

            const controls = document.createElement("div");
            controls.className = "carrito-cantidad";
            controls.innerHTML = `
                <button type="button" data-cart-action="decrease" aria-label="Quitar una unidad de ${name}">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-action="increase" aria-label="Agregar una unidad de ${name}">+</button>
            `;

            const remove = document.createElement("button");
            remove.className = "carrito-eliminar";
            remove.type = "button";
            remove.dataset.cartAction = "remove";
            remove.setAttribute("aria-label", `Eliminar ${name} del carrito`);
            remove.textContent = "Quitar";
            row.append(image, info, controls, remove);
            itemList.append(row);
        });

        totalLabel.textContent = currency.format(total);
    };

    cartButton.addEventListener("click", () => setPanelOpen(!panel.classList.contains("carrito-abierto")));
    panel.querySelector(".carrito-cerrar").addEventListener("click", () => setPanelOpen(false));
    backdrop.addEventListener("click", () => setPanelOpen(false));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && panel.classList.contains("carrito-abierto")) setPanelOpen(false);
    });

    productSection.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;

        const productCard = button.closest("article");
        const productName = productCard?.querySelector("h3")?.textContent.trim();
        if (!productName) return;

        const productPrice = Number(productCard.querySelector("p:nth-of-type(2)")?.textContent.replace(/\D/g, ""));
        const productImage = productCard.querySelector("img")?.getAttribute("src");
        if (!Number.isFinite(productPrice) || !productImage) return;

        const currentItem = cart.get(productName);
        cart.set(productName, {
            price: productPrice,
            image: productImage,
            quantity: (currentItem?.quantity || 0) + 1
        });
        renderCart();
        cartButton.classList.remove("carrito-rebote");
        void cartButton.offsetWidth;
        cartButton.classList.add("carrito-rebote");
        button.textContent = "Agregado";
        window.setTimeout(() => {
            if (button.isConnected) button.textContent = "Agregar al carrito";
        }, 850);
    });

    panel.addEventListener("click", (event) => {
        const control = event.target.closest("[data-cart-action]");
        if (!control) return;
        const row = control.closest(".carrito-item");
        const name = row?.querySelector("h3")?.textContent;
        const item = cart.get(name);
        if (!item) return;

        if (control.dataset.cartAction === "remove" || (control.dataset.cartAction === "decrease" && item.quantity === 1)) {
            cart.delete(name);
        } else if (control.dataset.cartAction === "decrease") {
            item.quantity -= 1;
        } else if (control.dataset.cartAction === "increase") {
            item.quantity += 1;
        }
        feedback.textContent = "";
        renderCart();
    });

    payButton.addEventListener("click", () => {
        feedback.textContent = "El carrito está listo. El procesamiento del pago estará disponible al conectar el backend.";
    });

    renderCart();
}

function setupAuthForms() {
    const form = document.querySelector(".formulario form");
    if (!form) return;

    const card = form.closest(".formulario");
    const feedback = createStatusMessage(card, "mensaje-interfaz");
    const password = form.querySelector("#password");
    const confirmation = form.querySelector("#confirmar-password");
    const registration = Boolean(confirmation);

    if (registration) {
        const selectedPlan = new URLSearchParams(window.location.search).get("plan");
        if (selectedPlan) {
            feedback.textContent = `Plan seleccionado: ${selectedPlan}. Podrás confirmar la membresía cuando esté conectada la plataforma.`;
        }

        const validatePasswords = () => {
            confirmation.setCustomValidity(
                confirmation.value && confirmation.value !== password.value
                    ? "Las contraseñas no coinciden."
                    : ""
            );
        };
        password.addEventListener("input", validatePasswords);
        confirmation.addEventListener("input", validatePasswords);
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        feedback.classList.add("mensaje-visible");
        if (window.location.protocol === "file:") {
            feedback.textContent = "Abre esta página desde http://127.0.0.1:3000 para continuar.";
            return;
        }
        const button = form.querySelector('button[type="submit"]');
        if (button.disabled) return;
        button.disabled = true;
        feedback.textContent = registration ? "Creando tu cuenta…" : "Iniciando sesión…";
        try {
            const response = await fetch(registration ? "/api/usuarios" : "/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(registration ? { nombre: form.querySelector("#nombre").value } : {}),
                    correo: form.querySelector("#correo").value,
                    password: password.value
                })
            });
            const result = await response.json();
            feedback.textContent = result.message || "No se pudo completar el registro.";
            if (response.ok) {
                if (!registration) {
                    window.location.assign("micuenta.html");
                    return;
                }
                form.reset();
                confirmation.setCustomValidity("");
                feedback.textContent = "Cuenta creada correctamente. Ya puedes iniciar sesión.";
            }
        } catch {
            feedback.textContent = "No se pudo contactar con el servidor. Comprueba que el backend esté activo.";
        } finally {
            button.disabled = false;
        }
    });
}

async function setupAccount() {
    const message = document.querySelector("#cuenta-mensaje");
    if (!message) return;
    const button = document.querySelector("#cerrar-sesion");
    try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (response.status === 401) { window.location.replace("login.html"); return; }
        if (!response.ok) throw new Error();
        const { usuario } = await response.json();
        document.querySelector("#cuenta-nombre").textContent = usuario.nombre;
        document.querySelector("#cuenta-correo").textContent = usuario.correo;
    } catch { message.textContent = "No se pudo cargar tu cuenta. Intenta recargar la página."; }
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            const response = await fetch("/api/logout", { method: "POST" });
            if (!response.ok) throw new Error();
            window.location.replace("login.html");
        } catch {
            message.textContent = "No se pudo cerrar sesión. Intenta nuevamente.";
            button.disabled = false;
        }
    });
}
