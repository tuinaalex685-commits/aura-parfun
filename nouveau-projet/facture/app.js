// CHADRA FACTURE - APPLICATION ENGINE

// --- STATE MANAGER ---
class StateStore {
    constructor() {
        this.session = null;
        this.supabaseConfig = null;
        this.supabaseClient = null;

        // Local Storage DB fallback structure
        this.db = {
            users: [],
            clients: [],
            invoices: [],
            invoiceItems: [],
            payments: []
        };

        this.init();
    }

    async init() {
        // Load Supabase credentials if configured
        const configStr = localStorage.getItem('chadra_supabase_config');
        if (configStr) {
            try {
                this.supabaseConfig = JSON.parse(configStr);
                this.initSupabase();
            } catch (e) {
                console.error("Failed to parse Supabase config", e);
            }
        }

        // Load local storage fallback DB
        const localDbStr = localStorage.getItem('chadra_local_db');
        if (localDbStr) {
            try {
                this.db = JSON.parse(localDbStr);
            } catch (e) {
                console.error("Failed to load local DB", e);
            }
        }

        // Insert default admin user if none exists (for ease of immediate testing)
        if (this.db.users.length === 0) {
            this.db.users.push({
                id: 'admin-uuid-1111-2222',
                email: 'demo@chadra.com',
                password_hash: 'demo123', // Simple text hash for MVP demo auth
                tax_pref_enabled: true,
                created_at: new Date().toISOString()
            });
            this.saveLocal();
        }

        // Load active session
        const activeSessionStr = localStorage.getItem('chadra_session');
        if (activeSessionStr) {
            try {
                this.session = JSON.parse(activeSessionStr);
            } catch (e) {
                console.error("Failed to load session", e);
            }
        }
    }

    initSupabase() {
        if (this.supabaseConfig && window.supabase) {
            this.supabaseClient = window.supabase.createClient(
                this.supabaseConfig.url,
                this.supabaseConfig.anonKey
            );
        }
    }

    saveLocal() {
        localStorage.setItem('chadra_local_db', JSON.stringify(this.db));
    }

    // --- AUTHENTICATION ---
    async login(email, password) {
        if (this.supabaseClient) {
            try {
                const { data, error } = await this.supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;
                this.session = data.user;
                localStorage.setItem('chadra_session', JSON.stringify(this.session));
                return { success: true, user: data.user };
            } catch (error) {
                return { success: false, message: error.message };
            }
        } else {
            // Local storage login fallback
            const user = this.db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password_hash === password);
            if (user) {
                this.session = { id: user.id, email: user.email, tax_pref_enabled: user.tax_pref_enabled };
                localStorage.setItem('chadra_session', JSON.stringify(this.session));
                return { success: true, user: this.session };
            }
            return { success: false, message: "Identifiants incorrects (Essayez: demo@chadra.com / demo123)" };
        }
    }

    async register(email, password) {
        if (this.supabaseClient) {
            try {
                const { data, error } = await this.supabaseClient.auth.signUp({ email, password });
                if (error) throw error;
                return { success: true, user: data.user, message: "Inscription réussie ! Veuillez vérifier votre email ou vous connecter." };
            } catch (error) {
                return { success: false, message: error.message };
            }
        } else {
            // Local storage registration
            const exists = this.db.users.some(u => u.email.toLowerCase() === email.toLowerCase());
            if (exists) {
                return { success: false, message: "Cet email est déjà utilisé." };
            }
            const newUser = {
                id: 'user-' + Math.random().toString(36).substr(2, 9),
                email: email,
                password_hash: password,
                tax_pref_enabled: true,
                created_at: new Date().toISOString()
            };
            this.db.users.push(newUser);
            this.saveLocal();
            return { success: true, message: "Compte créé ! Vous pouvez maintenant vous connecter." };
        }
    }

    logout() {
        this.session = null;
        localStorage.removeItem('chadra_session');
        if (this.supabaseClient) {
            this.supabaseClient.auth.signOut();
        }
    }

    // --- CLIENTS ---
    async getClients() {
        if (this.supabaseClient) {
            const { data, error } = await this.supabaseClient
                .from('clients')
                .select('*')
                .order('name', { ascending: true });
            if (error) throw error;
            return data;
        } else {
            return this.db.clients
                .filter(c => c.user_id === this.session.id)
                .sort((a, b) => a.name.localeCompare(b.name));
        }
    }

    async addClient(name, phone) {
        if (!this.session) throw new Error("Not logged in");
        if (this.supabaseClient) {
            const { data, error } = await this.supabaseClient
                .from('clients')
                .insert([{ user_id: this.session.id, name, phone }])
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const newClient = {
                id: 'client-' + Math.random().toString(36).substr(2, 9),
                user_id: this.session.id,
                name,
                phone,
                created_at: new Date().toISOString()
            };
            this.db.clients.push(newClient);
            this.saveLocal();
            return newClient;
        }
    }

    async updateClient(id, name, phone) {
        if (this.supabaseClient) {
            const { data, error } = await this.supabaseClient
                .from('clients')
                .update({ name, phone })
                .eq('id', id)
                .select();
            if (error) throw error;
            return data[0];
        } else {
            const client = this.db.clients.find(c => c.id === id && c.user_id === this.session.id);
            if (client) {
                client.name = name;
                client.phone = phone;
                this.saveLocal();
                return client;
            }
            throw new Error("Client not found");
        }
    }

    async deleteClient(id) {
        if (this.supabaseClient) {
            const { error } = await this.supabaseClient
                .from('clients')
                .delete()
                .eq('id', id);
            if (error) throw error;
        } else {
            // Delete client and cascade delete invoices/items/payments
            this.db.clients = this.db.clients.filter(c => !(c.id === id && c.user_id === this.session.id));
            const clientInvoices = this.db.invoices.filter(inv => inv.client_id === id);
            clientInvoices.forEach(inv => {
                this.db.invoiceItems = this.db.invoiceItems.filter(item => item.invoice_id !== inv.id);
                this.db.payments = this.db.payments.filter(pay => pay.invoice_id !== inv.id);
            });
            this.db.invoices = this.db.invoices.filter(inv => inv.client_id !== id);
            this.saveLocal();
        }
    }

    // --- INVOICES & ITEMS ---
    async getInvoices() {
        if (this.supabaseClient) {
            const { data, error } = await this.supabaseClient
                .from('invoices')
                .select(`
                    *,
                    clients (name, phone)
                `)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } else {
            return this.db.invoices
                .filter(inv => inv.user_id === this.session.id)
                .map(inv => {
                    const client = this.db.clients.find(c => c.id === inv.client_id) || { name: 'Client Inconnu', phone: '' };
                    return {
                        ...inv,
                        clients: client
                    };
                })
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
    }

    async getInvoiceDetails(invoiceId) {
        if (this.supabaseClient) {
            const { data: invoice, error: invErr } = await this.supabaseClient
                .from('invoices')
                .select('*, clients(*)')
                .eq('id', invoiceId)
                .single();
            if (invErr) throw invErr;

            const { data: items, error: itemErr } = await this.supabaseClient
                .from('invoice_items')
                .select('*')
                .eq('invoice_id', invoiceId);
            if (itemErr) throw itemErr;

            const { data: payments, error: payErr } = await this.supabaseClient
                .from('payments')
                .select('*')
                .eq('invoice_id', invoiceId);
            if (payErr) throw payErr;

            return { invoice, items, payments };
        } else {
            const invoice = this.db.invoices.find(inv => inv.id === invoiceId && inv.user_id === this.session.id);
            if (!invoice) throw new Error("Invoice not found");
            const client = this.db.clients.find(c => c.id === invoice.client_id) || { name: 'Client Inconnu', phone: '' };
            const items = this.db.invoiceItems.filter(item => item.invoice_id === invoiceId);
            const payments = this.db.payments.filter(pay => pay.invoice_id === invoiceId);
            return {
                invoice: { ...invoice, clients: client },
                items,
                payments
            };
        }
    }

    async createInvoice(clientId, taxEnabled, items) {
        if (!this.session) throw new Error("Not logged in");

        // Calculate Subtotal & Total
        let subtotal = 0;
        items.forEach(item => {
            subtotal += parseFloat(item.quantity) * parseFloat(item.unitPrice);
        });
        const total = taxEnabled ? subtotal * 1.18 : subtotal;

        if (this.supabaseClient) {
            // 1. Create Invoice Row
            const { data: invoiceData, error: invError } = await this.supabaseClient
                .from('invoices')
                .insert([{
                    user_id: this.session.id,
                    client_id: clientId,
                    total: total,
                    tax_enabled: taxEnabled,
                    status: 'unpaid'
                }])
                .select();
            if (invError) throw invError;
            const invoice = invoiceData[0];

            // 2. Create Invoice Items
            const itemsToInsert = items.map(item => ({
                invoice_id: invoice.id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unitPrice
            }));
            const { error: itemsError } = await this.supabaseClient
                .from('invoice_items')
                .insert(itemsToInsert);
            if (itemsError) throw itemsError;

            return invoice;
        } else {
            const invoiceId = 'invoice-' + Math.random().toString(36).substr(2, 9);
            const newInvoice = {
                id: invoiceId,
                user_id: this.session.id,
                client_id: clientId,
                total: parseFloat(total.toFixed(2)),
                tax_enabled: taxEnabled,
                status: 'unpaid',
                created_at: new Date().toISOString()
            };
            this.db.invoices.push(newInvoice);

            items.forEach(item => {
                this.db.invoiceItems.push({
                    id: 'item-' + Math.random().toString(36).substr(2, 9),
                    invoice_id: invoiceId,
                    description: item.description,
                    quantity: parseFloat(item.quantity),
                    unit_price: parseFloat(item.unitPrice)
                });
            });

            this.saveLocal();
            return newInvoice;
        }
    }

    // --- PAYMENTS & DEBTS ---
    async getPayments() {
        if (this.supabaseClient) {
            const { data, error } = await this.supabaseClient
                .from('payments')
                .select(`
                    *,
                    invoices (
                        id,
                        total,
                        clients (name)
                    )
                `)
                .order('date', { ascending: false });
            if (error) throw error;
            return data;
        } else {
            return this.db.payments
                .filter(pay => {
                    const inv = this.db.invoices.find(i => i.id === pay.invoice_id);
                    return inv && inv.user_id === this.session.id;
                })
                .map(pay => {
                    const inv = this.db.invoices.find(i => i.id === pay.invoice_id);
                    const client = this.db.clients.find(c => c.id === inv.client_id) || { name: 'Client Inconnu' };
                    return {
                        ...pay,
                        invoices: {
                            id: inv.id,
                            total: inv.total,
                            clients: client
                        }
                    };
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        }
    }

    async addPayment(invoiceId, amount) {
        amount = parseFloat(amount);
        if (this.supabaseClient) {
            // Add payment row
            const { data: paymentData, error: payErr } = await this.supabaseClient
                .from('payments')
                .insert([{ invoice_id: invoiceId, amount }])
                .select();
            if (payErr) throw payErr;

            // Recalculate invoice status
            await this.updateInvoiceStatus(invoiceId);
            return paymentData[0];
        } else {
            const newPayment = {
                id: 'payment-' + Math.random().toString(36).substr(2, 9),
                invoice_id: invoiceId,
                amount: amount,
                date: new Date().toISOString()
            };
            this.db.payments.push(newPayment);
            this.updateInvoiceStatusLocal(invoiceId);
            this.saveLocal();
            return newPayment;
        }
    }

    async updateInvoiceStatusLocal(invoiceId) {
        const invoice = this.db.invoices.find(i => i.id === invoiceId);
        if (!invoice) return;
        const payments = this.db.payments.filter(p => p.invoice_id === invoiceId);
        const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);

        if (paidTotal >= invoice.total) {
            invoice.status = 'paid';
        } else if (paidTotal > 0) {
            invoice.status = 'partially_paid';
        } else {
            invoice.status = 'unpaid';
        }
    }

    async updateInvoiceStatus(invoiceId) {
        const { data: invoice, error: invErr } = await this.supabaseClient
            .from('invoices')
            .select('total')
            .eq('id', invoiceId)
            .single();
        if (invErr) throw invErr;

        const { data: payments, error: payErr } = await this.supabaseClient
            .from('payments')
            .select('amount')
            .eq('invoice_id', invoiceId);
        if (payErr) throw payErr;

        const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
        let status = 'unpaid';
        if (paidTotal >= invoice.total) {
            status = 'paid';
        } else if (paidTotal > 0) {
            status = 'partially_paid';
        }

        const { error: updErr } = await this.supabaseClient
            .from('invoices')
            .update({ status })
            .eq('id', invoiceId);
        if (updErr) throw updErr;
    }

    async getDebtOverview() {
        const invoices = await this.getInvoices();
        const payments = await this.getPayments();

        const debts = {};
        invoices.forEach(inv => {
            const clientId = inv.client_id;
            const clientName = inv.clients.name;
            if (!debts[clientId]) {
                debts[clientId] = { clientId, clientName, totalInvoiced: 0, totalPaid: 0, totalDebt: 0 };
            }
            debts[clientId].totalInvoiced += parseFloat(inv.total);
        });

        payments.forEach(pay => {
            const inv = invoices.find(i => i.id === pay.invoice_id);
            if (inv) {
                const clientId = inv.client_id;
                if (debts[clientId]) {
                    debts[clientId].totalPaid += parseFloat(pay.amount);
                }
            }
        });

        Object.keys(debts).forEach(id => {
            debts[id].totalDebt = Math.max(0, debts[id].totalInvoiced - debts[id].totalPaid);
            debts[id].totalInvoiced = parseFloat(debts[id].totalInvoiced.toFixed(2));
            debts[id].totalPaid = parseFloat(debts[id].totalPaid.toFixed(2));
            debts[id].totalDebt = parseFloat(debts[id].totalDebt.toFixed(2));
        });

        return Object.values(debts).filter(d => d.totalDebt > 0);
    }
}

// Global App State Instance
const store = new StateStore();

// --- UI ROUTER & CONTROLLER ---
const App = {
    currentTab: 'dashboard',
    clients: [],
    invoices: [],
    payments: [],
    
    // Pagination & Search
    clientsPage: 1,
    clientsPerPage: 10,
    clientsSearch: '',
    
    invoicesSearch: '',
    invoicesStatusFilter: 'all',

    async init() {
        this.setupEventListeners();
        this.renderAuth();
    },

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('[data-tab-target]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const target = tab.getAttribute('data-tab-target');
                this.switchTab(target);
            });
        });

        // Auth Submit
        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;
                const mode = document.getElementById('auth-mode').value;

                let res;
                if (mode === 'login') {
                    res = await store.login(email, password);
                } else {
                    res = await store.register(email, password);
                }

                if (res.success) {
                    if (mode === 'login') {
                        this.renderAuth();
                        this.switchTab('dashboard');
                    } else {
                        alert(res.message);
                        this.toggleAuthMode('login');
                    }
                } else {
                    alert(res.message);
                }
            });
        }

        // Toggle Auth Register/Login
        const toggleAuthBtn = document.getElementById('toggle-auth-mode');
        if (toggleAuthBtn) {
            toggleAuthBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const currentMode = document.getElementById('auth-mode').value;
                this.toggleAuthMode(currentMode === 'login' ? 'register' : 'login');
            });
        }

        // Logout Button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                store.logout();
                this.renderAuth();
            });
        }

        // Search & Filters inputs
        const clientSearchInput = document.getElementById('client-search');
        if (clientSearchInput) {
            clientSearchInput.addEventListener('input', (e) => {
                this.clientsSearch = e.target.value;
                this.clientsPage = 1;
                this.renderClients();
            });
        }

        const invoiceSearchInput = document.getElementById('invoice-search');
        if (invoiceSearchInput) {
            invoiceSearchInput.addEventListener('input', (e) => {
                this.invoicesSearch = e.target.value;
                this.renderInvoices();
            });
        }

        const invoiceFilter = document.getElementById('invoice-status-filter');
        if (invoiceFilter) {
            invoiceFilter.addEventListener('input', (e) => {
                this.invoicesStatusFilter = e.target.value;
                this.renderInvoices();
            });
        }

        // Add Client Submission
        const clientForm = document.getElementById('client-form');
        if (clientForm) {
            clientForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('client-name').value;
                const phone = document.getElementById('client-phone').value;
                const id = document.getElementById('client-edit-id').value;

                try {
                    if (id) {
                        await store.updateClient(id, name, phone);
                    } else {
                        await store.addClient(name, phone);
                    }
                    this.closeModal('client-modal');
                    clientForm.reset();
                    await this.loadData();
                    this.renderClients();
                    this.renderDashboard();
                } catch (err) {
                    alert("Erreur: " + err.message);
                }
            });
        }

        // Add Invoice item row trigger
        const addItemBtn = document.getElementById('add-invoice-item-btn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => {
                this.addInvoiceItemRow();
            });
        }

        // Add Invoice Submission
        const invoiceForm = document.getElementById('invoice-form');
        if (invoiceForm) {
            invoiceForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const clientId = document.getElementById('invoice-client-select').value;
                const taxEnabled = document.getElementById('invoice-tax-toggle').checked;
                
                // Read items
                const items = [];
                const itemRows = document.querySelectorAll('.invoice-item-row');
                itemRows.forEach(row => {
                    const description = row.querySelector('.item-desc').value;
                    const quantity = row.querySelector('.item-qty').value;
                    const unitPrice = row.querySelector('.item-price').value;
                    if (description && quantity && unitPrice) {
                        items.push({ description, quantity, unitPrice });
                    }
                });

                if (!clientId) {
                    alert("Veuillez sélectionner un client.");
                    return;
                }
                if (items.length === 0) {
                    alert("Veuillez ajouter au moins une ligne de facture.");
                    return;
                }

                try {
                    await store.createInvoice(clientId, taxEnabled, items);
                    this.closeModal('invoice-modal');
                    invoiceForm.reset();
                    document.getElementById('invoice-items-container').innerHTML = '';
                    this.addInvoiceItemRow(); // Default initial row
                    await this.loadData();
                    this.renderInvoices();
                    this.renderDashboard();
                } catch (err) {
                    alert("Erreur: " + err.message);
                }
            });
        }

        // Add Payment Submission
        const paymentForm = document.getElementById('payment-form');
        if (paymentForm) {
            paymentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const invoiceId = document.getElementById('payment-invoice-id').value;
                const amount = document.getElementById('payment-amount').value;

                try {
                    await store.addPayment(invoiceId, amount);
                    this.closeModal('payment-modal');
                    paymentForm.reset();
                    await this.loadData();
                    this.renderInvoices();
                    this.renderPayments();
                    this.renderDashboard();
                } catch (err) {
                    alert("Erreur: " + err.message);
                }
            });
        }

        // Supabase Settings Submission
        const supabaseForm = document.getElementById('supabase-config-form');
        if (supabaseForm) {
            supabaseForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const url = document.getElementById('supabase-url').value;
                const key = document.getElementById('supabase-key').value;

                if (url && key) {
                    store.supabaseConfig = { url, anonKey: key };
                    localStorage.setItem('chadra_supabase_config', JSON.stringify(store.supabaseConfig));
                    store.initSupabase();
                    alert("Supabase configuré avec succès ! Reconnexion en cours...");
                    store.logout();
                    this.renderAuth();
                } else {
                    localStorage.removeItem('chadra_supabase_config');
                    store.supabaseConfig = null;
                    store.supabaseClient = null;
                    alert("Supabase désactivé. Retour à la base locale.");
                    store.logout();
                    this.renderAuth();
                }
            });
        }
    },

    toggleAuthMode(mode) {
        const title = document.getElementById('auth-title');
        const submitBtn = document.getElementById('auth-submit-btn');
        const toggleBtn = document.getElementById('toggle-auth-mode');
        const modeInput = document.getElementById('auth-mode');

        if (mode === 'login') {
            title.textContent = "Se connecter à Chadra Facture";
            submitBtn.textContent = "Se connecter";
            toggleBtn.textContent = "Créer un compte";
            modeInput.value = 'login';
        } else {
            title.textContent = "Créer un compte";
            submitBtn.textContent = "S'inscrire";
            toggleBtn.textContent = "Déjà un compte ? Connexion";
            modeInput.value = 'register';
        }
    },

    renderAuth() {
        const appLayout = document.getElementById('app-layout');
        const authLayout = document.getElementById('auth-layout');

        if (store.session) {
            appLayout.classList.remove('hidden');
            authLayout.classList.add('hidden');
            document.getElementById('user-profile-email').textContent = store.session.email;
            this.loadData().then(() => {
                this.switchTab('dashboard');
            });
        } else {
            appLayout.classList.add('hidden');
            authLayout.classList.remove('hidden');
        }
    },

    async loadData() {
        if (!store.session) return;
        try {
            this.clients = await store.getClients();
            this.invoices = await store.getInvoices();
            this.payments = await store.getPayments();
        } catch (e) {
            console.error("Error loading application data", e);
        }
    },

    switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update sidebar links styles
        document.querySelectorAll('[data-tab-target]').forEach(tab => {
            const target = tab.getAttribute('data-tab-target');
            if (target === tabName) {
                tab.classList.add('bg-primary-50', 'text-primary-600', 'dark:bg-primary-900/30', 'dark:text-primary-400');
                tab.classList.remove('text-gray-600', 'hover:bg-gray-50', 'dark:text-gray-400', 'dark:hover:bg-gray-800');
            } else {
                tab.classList.remove('bg-primary-50', 'text-primary-600', 'dark:bg-primary-900/30', 'dark:text-primary-400');
                tab.classList.add('text-gray-600', 'hover:bg-gray-50', 'dark:text-gray-400', 'dark:hover:bg-gray-800');
            }
        });

        // Hide all views, show active view
        document.querySelectorAll('.app-view').forEach(view => {
            view.classList.add('hidden');
        });
        const activeView = document.getElementById(`${tabName}-view`);
        if (activeView) activeView.classList.remove('hidden');

        // Render tab content
        if (tabName === 'dashboard') this.renderDashboard();
        if (tabName === 'clients') this.renderClients();
        if (tabName === 'invoices') this.renderInvoices();
        if (tabName === 'payments') this.renderPayments();
        if (tabName === 'settings') this.renderSettings();
    },

    // --- DASHBOARD VIEW ---
    renderDashboard() {
        // Stats calculations
        const totalClients = this.clients.length;
        const totalFactures = this.invoices.length;
        
        let totalFactureVal = 0;
        let totalEncaisseVal = 0;

        this.invoices.forEach(inv => {
            totalFactureVal += parseFloat(inv.total);
        });

        this.payments.forEach(pay => {
            totalEncaisseVal += parseFloat(pay.amount);
        });

        const totalImpayeVal = Math.max(0, totalFactureVal - totalEncaisseVal);

        // Update DOM elements
        document.getElementById('stat-clients').textContent = totalClients;
        document.getElementById('stat-factures').textContent = totalFactures;
        document.getElementById('stat-total-facture').textContent = this.formatCurrency(totalFactureVal);
        document.getElementById('stat-total-encaisse').textContent = this.formatCurrency(totalEncaisseVal);
        document.getElementById('stat-total-impaye').textContent = this.formatCurrency(totalImpayeVal);

        // Recent Invoices list
        const recentContainer = document.getElementById('recent-invoices-list');
        recentContainer.innerHTML = '';
        
        const recentInvoices = this.invoices.slice(0, 5);
        if (recentInvoices.length === 0) {
            recentContainer.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Aucune facture enregistrée</td></tr>`;
        } else {
            recentInvoices.forEach(inv => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors";
                tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                        #${inv.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${inv.clients.name}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                        ${this.formatCurrency(inv.total)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${this.formatDate(inv.created_at)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${this.getStatusBadge(inv.status)}
                    </td>
                `;
                recentContainer.appendChild(tr);
            });
        }

        // Late payment alerts
        const alertsContainer = document.getElementById('dashboard-alerts-list');
        alertsContainer.innerHTML = '';

        const lateInvoices = this.invoices.filter(inv => inv.status !== 'paid');
        if (lateInvoices.length === 0) {
            alertsContainer.innerHTML = `
                <div class="flex items-center p-4 text-sm text-green-800 border border-green-300 rounded-xl bg-green-50/50 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800" role="alert">
                    <svg class="flex-shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/>
                    </svg>
                    <div>Tout est à jour ! Aucun retard de paiement.</div>
                </div>
            `;
        } else {
            lateInvoices.slice(0, 3).forEach(inv => {
                const div = document.createElement('div');
                div.className = "flex justify-between items-center p-4 text-sm text-amber-800 border border-amber-300 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900";
                div.innerHTML = `
                    <div class="flex items-center">
                        <svg class="flex-shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/>
                        </svg>
                        <div>
                            <span class="font-bold">${inv.clients.name}</span> doit encore un solde sur la facture <span class="font-mono">#${inv.id.substring(0, 8).toUpperCase()}</span>.
                        </div>
                    </div>
                    <button onclick="App.openPaymentModal('${inv.id}')" class="text-xs bg-amber-200 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-300 px-3 py-1.5 rounded-lg font-semibold transition-colors">
                        Payer
                    </button>
                `;
                alertsContainer.appendChild(div);
            });
        }
    },

    // --- CLIENTS VIEW ---
    renderClients() {
        const clientBody = document.getElementById('clients-table-body');
        clientBody.innerHTML = '';

        // Filter clients based on search query
        const query = this.clientsSearch.toLowerCase().trim();
        const filteredClients = this.clients.filter(c => 
            c.name.toLowerCase().includes(query) || 
            (c.phone && c.phone.includes(query))
        );

        // Pagination
        const totalItems = filteredClients.length;
        const totalPages = Math.ceil(totalItems / this.clientsPerPage);
        
        // Slice the clients to display only current page
        const startIdx = (this.clientsPage - 1) * this.clientsPerPage;
        const endIdx = startIdx + this.clientsPerPage;
        const paginatedClients = filteredClients.slice(startIdx, endIdx);

        if (paginatedClients.length === 0) {
            clientBody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Aucun client trouvé</td></tr>`;
        } else {
            paginatedClients.forEach(c => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors";
                tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                        ${c.name}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${c.phone || '-'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${this.formatDate(c.created_at)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onclick="App.openEditClientModal('${c.id}', '${c.name}', '${c.phone}')" class="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 mr-3">Modifier</button>
                        <button onclick="App.deleteClient('${c.id}')" class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">Supprimer</button>
                    </td>
                `;
                clientBody.appendChild(tr);
            });
        }

        // Render Pagination Info & Controls
        this.renderClientsPagination(totalPages);
    },

    renderClientsPagination(totalPages) {
        const info = document.getElementById('pagination-info');
        const prevBtn = document.getElementById('pagination-prev');
        const nextBtn = document.getElementById('pagination-next');

        if (totalPages <= 1) {
            info.parentElement.classList.add('hidden');
            return;
        }

        info.parentElement.classList.remove('hidden');
        info.innerHTML = `Page <span class="font-bold text-gray-900 dark:text-white">${this.clientsPage}</span> sur <span class="font-bold text-gray-900 dark:text-white">${totalPages}</span>`;

        prevBtn.disabled = this.clientsPage === 1;
        nextBtn.disabled = this.clientsPage === totalPages;

        // Reset click handlers to avoid duplicate bindings
        prevBtn.onclick = () => {
            if (this.clientsPage > 1) {
                this.clientsPage--;
                this.renderClients();
            }
        };

        nextBtn.onclick = () => {
            if (this.clientsPage < totalPages) {
                this.clientsPage++;
                this.renderClients();
            }
        };
    },

    openAddClientModal() {
        document.getElementById('client-modal-title').textContent = "Ajouter un client";
        document.getElementById('client-edit-id').value = '';
        document.getElementById('client-name').value = '';
        document.getElementById('client-phone').value = '';
        this.openModal('client-modal');
    },

    openEditClientModal(id, name, phone) {
        document.getElementById('client-modal-title').textContent = "Modifier le client";
        document.getElementById('client-edit-id').value = id;
        document.getElementById('client-name').value = name;
        document.getElementById('client-phone').value = phone === 'undefined' ? '' : phone;
        this.openModal('client-modal');
    },

    async deleteClient(id) {
        if (confirm("Voulez-vous vraiment supprimer ce client ? Cela supprimera toutes ses factures et paiements associés.")) {
            try {
                await store.deleteClient(id);
                await this.loadData();
                this.renderClients();
                this.renderDashboard();
            } catch (err) {
                alert("Erreur de suppression: " + err.message);
            }
        }
    },

    // --- INVOICES VIEW ---
    renderInvoices() {
        const invoiceBody = document.getElementById('invoices-table-body');
        invoiceBody.innerHTML = '';

        // Filter invoices based on search & status filter
        const query = this.invoicesSearch.toLowerCase().trim();
        const status = this.invoicesStatusFilter;

        const filteredInvoices = this.invoices.filter(inv => {
            const matchesQuery = inv.clients.name.toLowerCase().includes(query) || 
                                 inv.id.toLowerCase().includes(query);
            const matchesStatus = status === 'all' || inv.status === status;
            return matchesQuery && matchesStatus;
        });

        if (filteredInvoices.length === 0) {
            invoiceBody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Aucune facture trouvée</td></tr>`;
        } else {
            filteredInvoices.forEach(inv => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors";
                tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                        #${inv.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${inv.clients.name}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                        ${this.formatCurrency(inv.total)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${this.formatDate(inv.created_at)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${this.getStatusBadge(inv.status)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onclick="App.viewInvoiceDetails('${inv.id}')" class="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 mr-3">Détail</button>
                        ${inv.status !== 'paid' ? `<button onclick="App.openPaymentModal('${inv.id}')" class="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 mr-3">Payer</button>` : ''}
                    </td>
                `;
                invoiceBody.appendChild(tr);
            });
        }
    },

    openAddInvoiceModal() {
        const clientSelect = document.getElementById('invoice-client-select');
        clientSelect.innerHTML = '<option value="">Sélectionner un client...</option>';
        
        this.clients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.name} (${c.phone || 'Pas de numéro'})`;
            clientSelect.appendChild(opt);
        });

        // Initialize items container with a single clean row
        const container = document.getElementById('invoice-items-container');
        container.innerHTML = '';
        this.addInvoiceItemRow();

        // Default default VAT toggle based on user config (here default is checked)
        document.getElementById('invoice-tax-toggle').checked = true;

        this.openModal('invoice-modal');
    },

    addInvoiceItemRow() {
        const container = document.getElementById('invoice-items-container');
        const row = document.createElement('div');
        row.className = "invoice-item-row grid grid-cols-12 gap-3 items-center mb-3 bg-gray-50/50 dark:bg-gray-800/20 p-3 rounded-xl border border-gray-100 dark:border-gray-800";
        row.innerHTML = `
            <div class="col-span-6">
                <input type="text" placeholder="Description de l'article" class="item-desc w-full rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500 text-sm py-2" required>
            </div>
            <div class="col-span-2">
                <input type="number" placeholder="Qté" min="1" step="any" value="1" class="item-qty w-full rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500 text-sm py-2" required>
            </div>
            <div class="col-span-3">
                <input type="number" placeholder="P.U." min="0" step="any" class="item-price w-full rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500 text-sm py-2" required>
            </div>
            <div class="col-span-1 text-center">
                <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-500 hover:text-red-700 transition-colors">
                    <svg class="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        container.appendChild(row);
    },

    async viewInvoiceDetails(invoiceId) {
        try {
            const data = await store.getInvoiceDetails(invoiceId);
            const { invoice, items, payments } = data;

            // Generate HTML dynamic structure inside invoice-detail-content
            const container = document.getElementById('invoice-detail-content');
            
            let itemsHtml = '';
            let subtotal = 0;
            items.forEach((item, index) => {
                const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
                subtotal += itemTotal;
                itemsHtml += `
                    <tr class="border-b border-gray-100 dark:border-gray-800">
                        <td class="py-3 text-sm text-gray-900 dark:text-white font-medium">${item.description}</td>
                        <td class="py-3 text-center text-sm text-gray-500 dark:text-gray-400">${item.quantity}</td>
                        <td class="py-3 text-right text-sm text-gray-500 dark:text-gray-400">${this.formatCurrency(item.unit_price)}</td>
                        <td class="py-3 text-right text-sm text-gray-900 dark:text-white font-medium">${this.formatCurrency(itemTotal)}</td>
                    </tr>
                `;
            });

            const tax = invoice.tax_enabled ? subtotal * 0.18 : 0;
            const total = subtotal + tax;

            let paymentsHtml = '';
            let totalPaid = 0;
            if (payments.length === 0) {
                paymentsHtml = `<p class="text-sm text-gray-500 italic">Aucun paiement enregistré pour cette facture.</p>`;
            } else {
                paymentsHtml = `<ul class="divide-y divide-gray-100 dark:divide-gray-800">`;
                payments.forEach(p => {
                    totalPaid += parseFloat(p.amount);
                    paymentsHtml += `
                        <li class="py-2.5 flex justify-between items-center text-sm">
                            <span class="text-gray-500 dark:text-gray-400">${this.formatDate(p.date)}</span>
                            <span class="font-semibold text-gray-900 dark:text-white">+ ${this.formatCurrency(p.amount)}</span>
                        </li>
                    `;
                });
                paymentsHtml += `</ul>`;
            }

            const debtRemaining = Math.max(0, total - totalPaid);

            container.innerHTML = `
                <div id="print-area" class="p-6 bg-white dark:bg-gray-900 rounded-2xl">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-gray-100 dark:border-gray-800 gap-4">
                        <div>
                            <span class="text-xs uppercase font-extrabold tracking-wider text-primary-600 dark:text-primary-400">FACTURE CHADRA</span>
                            <h2 class="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">N° ${invoice.id.substring(0, 8).toUpperCase()}</h2>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Date : ${this.formatDate(invoice.created_at)}</p>
                        </div>
                        <div class="flex flex-col items-start md:items-end">
                            <span class="text-xs text-gray-400 font-medium uppercase">Statut</span>
                            <div class="mt-1">${this.getStatusBadge(invoice.status)}</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 border-b border-gray-100 dark:border-gray-800">
                        <div>
                            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider">Facturé à</h4>
                            <p class="text-sm font-bold text-gray-900 dark:text-white mt-2">${invoice.clients.name}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">${invoice.clients.phone || 'Pas de numéro'}</p>
                        </div>
                        <div class="md:text-right">
                            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider">Émetteur</h4>
                            <p class="text-sm font-bold text-gray-900 dark:text-white mt-2">${store.session.email}</p>
                        </div>
                    </div>

                    <table class="w-full my-6">
                        <thead>
                            <tr class="border-b border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-400 uppercase text-left">
                                <th class="pb-3">Description</th>
                                <th class="pb-3 text-center">Quantité</th>
                                <th class="pb-3 text-right">Prix Unitaire</th>
                                <th class="pb-3 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <div class="flex flex-col md:flex-row justify-between gap-6 pt-4">
                        <div class="w-full md:w-1/2">
                            <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Historique des Paiements</h4>
                            ${paymentsHtml}
                        </div>
                        <div class="w-full md:w-1/3 space-y-2.5">
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-500 dark:text-gray-400">Sous-total :</span>
                                <span class="font-medium text-gray-900 dark:text-white">${this.formatCurrency(subtotal)}</span>
                            </div>
                            ${invoice.tax_enabled ? `
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-500 dark:text-gray-400">TVA (18%) :</span>
                                <span class="font-medium text-gray-900 dark:text-white">${this.formatCurrency(tax)}</span>
                            </div>
                            ` : ''}
                            <div class="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-2.5 text-base font-bold">
                                <span class="text-gray-900 dark:text-white">Total :</span>
                                <span class="text-gray-900 dark:text-white">${this.formatCurrency(total)}</span>
                            </div>
                            <div class="flex justify-between text-sm text-green-600 dark:text-green-400">
                                <span>Total encaissé :</span>
                                <span class="font-medium">${this.formatCurrency(totalPaid)}</span>
                            </div>
                            <div class="flex justify-between border-t border-dashed border-gray-200 dark:border-gray-700 pt-2.5 text-sm font-extrabold text-red-600 dark:text-red-400">
                                <span>Reste à payer :</span>
                                <span>${this.formatCurrency(debtRemaining)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex justify-end gap-3 p-6 border-t border-gray-100 dark:border-gray-800 no-print">
                    <button onclick="window.print()" class="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-750 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                        Imprimer / PDF
                    </button>
                    <button onclick="App.closeModal('invoice-detail-modal')" class="px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-750 rounded-xl transition-colors">
                        Fermer
                    </button>
                </div>
            `;

            this.openModal('invoice-detail-modal');
        } catch (err) {
            alert("Erreur de chargement: " + err.message);
        }
    },

    openPaymentModal(invoiceId) {
        const inv = this.invoices.find(i => i.id === invoiceId);
        if (!inv) return;
        
        document.getElementById('payment-invoice-id').value = invoiceId;
        document.getElementById('payment-amount').value = '';
        
        // Calculate remaining debt
        const payments = this.payments.filter(p => p.invoice_id === invoiceId);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const remaining = Math.max(0, inv.total - totalPaid);

        document.getElementById('payment-debt-info').textContent = `Reste à payer : ${this.formatCurrency(remaining)}`;
        document.getElementById('payment-amount').setAttribute('max', remaining);
        document.getElementById('payment-amount').value = remaining.toFixed(2);

        this.openModal('payment-modal');
    },

    // --- PAYMENTS VIEW ---
    async renderPayments() {
        const paymentBody = document.getElementById('payments-table-body');
        paymentBody.innerHTML = '';

        if (this.payments.length === 0) {
            paymentBody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Aucun paiement enregistré</td></tr>`;
        } else {
            this.payments.forEach(pay => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors";
                tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                        #${pay.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${pay.invoices.clients.name}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">
                        #${pay.invoice_id.substring(0, 8).toUpperCase()}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                        ${this.formatCurrency(pay.amount)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${this.formatDate(pay.date)}
                    </td>
                `;
                paymentBody.appendChild(tr);
            });
        }

        // Render Debts Overview
        const debtBody = document.getElementById('debts-table-body');
        debtBody.innerHTML = '';

        try {
            const debts = await store.getDebtOverview();
            if (debts.length === 0) {
                debtBody.innerHTML = `<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500">Aucune dette en cours</td></tr>`;
            } else {
                debts.forEach(d => {
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors";
                    tr.innerHTML = `
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                            ${d.clientName}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                            ${this.formatCurrency(d.totalInvoiced)}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600 dark:text-red-400 font-extrabold">
                            ${this.formatCurrency(d.totalDebt)}
                        </td>
                    `;
                    debtBody.appendChild(tr);
                });
            }
        } catch (e) {
            console.error("Error loading debt overview", e);
        }
    },

    // --- PARAMETERS VIEW ---
    renderSettings() {
        if (store.supabaseConfig) {
            document.getElementById('supabase-url').value = store.supabaseConfig.url;
            document.getElementById('supabase-key').value = store.supabaseConfig.anonKey;
        } else {
            document.getElementById('supabase-url').value = '';
            document.getElementById('supabase-key').value = '';
        }
    },

    // --- UTILS ---
    formatCurrency(value) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(value);
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    getStatusBadge(status) {
        if (status === 'paid') {
            return `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 border border-green-200 dark:border-green-800">
                <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Payé
            </span>`;
        } else if (status === 'partially_paid') {
            return `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Partiel
            </span>`;
        } else {
            return `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800">
                <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>Impayé
            </span>`;
        }
    },

    openModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    },

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }
    }
};

// Start application once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    App.init();
});
