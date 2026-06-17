// script.js - Interactive features and animations for Aura Parfums

document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    // Change this WhatsApp phone number (with country code +226 for Burkina Faso)
    const WHATSAPP_PHONE = '22657138126'; 

    // --- 1. PRELOADER & INITIAL LOAD ---
    const preloader = document.getElementById('preloader');
    
    // Ensure preloader finishes fadeout when page is fully loaded
    window.addEventListener('load', () => {
        setTimeout(() => {
            document.body.classList.add('loaded');
            // Trigger animation for hero section right after loading
            triggerScrollAnimations();
        }, 800); // Small delay for visual aesthetic
    });

    // Fallback if load event takes too long
    setTimeout(() => {
        if (!document.body.classList.contains('loaded')) {
            document.body.classList.add('loaded');
            triggerScrollAnimations();
        }
    }, 4000);

    // --- 2. HEADER SCROLL INTERACTION ---
    const header = document.querySelector('header');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // --- 3. RESPONSIVE MOBILE MENU ---
    const menuBtn = document.getElementById('menuBtn');
    const navLinks = document.getElementById('navLinks');
    const navOverlay = document.getElementById('navOverlay');
    const links = document.querySelectorAll('.nav-links a');

    const toggleMenu = () => {
        menuBtn.classList.toggle('active');
        navLinks.classList.toggle('active');
        navOverlay.classList.toggle('active');
        
        // Prevent body scrolling when mobile menu is open
        if (navLinks.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    };

    menuBtn.addEventListener('click', toggleMenu);
    navOverlay.addEventListener('click', toggleMenu);

    // Close menu when clicking navigation links
    links.forEach(link => {
        link.addEventListener('click', () => {
            if (navLinks.classList.contains('active')) {
                toggleMenu();
            }
        });
    });

    // --- 4. SCROLL ANIMATIONS (Intersection Observer) ---
    const animElements = document.querySelectorAll('.fade-in-up');

    const triggerScrollAnimations = () => {
        if ('IntersectionObserver' in window) {
            const observerOptions = {
                root: null,
                rootMargin: '0px',
                threshold: 0.15
            };

            const observer = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('active');
                        // Unobserve element after animation has triggered once
                        observer.unobserve(entry.target);
                    }
                });
            }, observerOptions);

            animElements.forEach(element => {
                observer.observe(element);
            });
        } else {
            // Fallback for older browsers: show all elements directly
            animElements.forEach(element => {
                element.classList.add('active');
            });
        }
    };

    // --- 4.5. FAQ ACCORDION INTERACTION ---
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close all items
            faqItems.forEach(faq => faq.classList.remove('active'));
            
            // Toggle clicked item
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // --- 5. DYNAMIC WHATSAPP LINKS (Optional Helper) ---
    // This script automatically updates any WhatsApp link containing wa.me/22657138126
    // to match WHATSAPP_PHONE config, making it easily configurable in one place.
    const whatsappLinks = document.querySelectorAll('a[href*="wa.me/22657138126"]');
    whatsappLinks.forEach(link => {
        const originalHref = link.getAttribute('href');
        const updatedHref = originalHref.replace('22657138126', WHATSAPP_PHONE);
        link.setAttribute('href', updatedHref);
    });

});
