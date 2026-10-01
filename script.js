(() => {
  'use strict';

  const TOTAL_STEPS = 5;
  const form = document.querySelector('#briefingForm');
  const steps = [...document.querySelectorAll('.form-step')];
  const progressFill = document.querySelector('#progressFill');
  const progressPercent = document.querySelector('#progressPercent');
  const stepLabel = document.querySelector('#stepLabel');
  const dots = [...document.querySelectorAll('.step-dots span')];
  const nextButton = document.querySelector('#nextButton');
  const prevButton = document.querySelector('#prevButton');
  const reviewButton = document.querySelector('#reviewButton');
  const formFeedback = document.querySelector('#formFeedback');
  const navHint = document.querySelector('#navHint');
  const reviewSection = document.querySelector('#reviewSection');
  const reviewGrid = document.querySelector('#reviewGrid');
  const editButton = document.querySelector('#editButton');
  const sendButton = document.querySelector('#sendButton');
  const heroCta = document.querySelector('#heroCta');
  let currentStep = 1;

  const stepHints = [
    'Você está no começo. Vamos por partes.',
    'Ótimo. Agora vamos falar de quem compra.',
    'Essa parte deixa a sua história mais forte.',
    'A estética também conta o que você faz.',
    'Só falta deixar a conversa encaminhada.'
  ];

  const stepNames = ['O essencial', 'Público e oferta', 'Conteúdo', 'Direção visual', 'Próximos passos'];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

  function setStep(step) {
    currentStep = Math.min(Math.max(step, 1), TOTAL_STEPS);
    steps.forEach((item) => item.classList.toggle('active', Number(item.dataset.step) === currentStep));
    const percentage = Math.round((currentStep / TOTAL_STEPS) * 100);
    progressFill.style.width = `${percentage}%`;
    progressPercent.textContent = `${percentage}%`;
    stepLabel.textContent = `Etapa ${String(currentStep).padStart(2, '0')} de ${String(TOTAL_STEPS).padStart(2, '0')}`;
    dots.forEach((dot, index) => dot.classList.toggle('current', index === currentStep - 1));
    prevButton.hidden = currentStep === 1;
    nextButton.hidden = currentStep === TOTAL_STEPS;
    reviewButton.hidden = currentStep !== TOTAL_STEPS;
    navHint.textContent = stepHints[currentStep - 1];
    formFeedback.textContent = '';
  }

  function clearFieldError(field) {
    field.classList.remove('has-error');
    const message = field.querySelector('.field-error');
    if (message) message.textContent = '';
  }

  function showFieldError(field, message) {
    field.classList.add('has-error');
    const messageElement = field.querySelector('.field-error');
    if (messageElement) messageElement.textContent = message;
  }

  function validateStep(stepNumber) {
    let firstInvalid = null;
    let isValid = true;
    const currentFields = steps[stepNumber - 1].querySelectorAll('input, select, textarea');
    currentFields.forEach((control) => {
      const field = control.closest('.field');
      clearFieldError(field);
      if (control.required && !control.value.trim()) {
        showFieldError(field, 'Preencha este campo para continuar.');
        firstInvalid = firstInvalid || control;
        isValid = false;
      } else if (control.type === 'email' && control.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(control.value.trim())) {
        showFieldError(field, 'Digite um e-mail válido.');
        firstInvalid = firstInvalid || control;
        isValid = false;
      } else if (control.type === 'tel' && control.value.trim() && control.value.replace(/\D/g, '').length < 10) {
        showFieldError(field, 'Digite um telefone com DDD.');
        firstInvalid = firstInvalid || control;
        isValid = false;
      }
    });
    if (firstInvalid) {
      formFeedback.textContent = 'Tem um detalhe para completar antes de seguir.';
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return isValid;
  }

  function collectAnswers() {
    const data = {};
    form.querySelectorAll('input, select, textarea').forEach((control) => {
      data[control.name] = control.value.trim() || 'Não informado';
    });
    return data;
  }

  function renderReview() {
    const answers = collectAnswers();
    const groups = [
      { title: '01 / O essencial', fields: ['Nome da empresa', 'Segmento de atuação', 'Cidade / região', 'Modelo de negócio', 'O que a empresa faz', 'Objetivo principal'] },
      { title: '02 / Público e oferta', fields: ['Cliente ideal', 'Oferta principal', 'Faixa de preço', 'Ação de conversão', 'Diferenciais', 'Referências de mercado'] },
      { title: '03 / Conteúdo', fields: ['Produtos e serviços', 'Números e resultados', 'Depoimentos', 'História da marca', 'Dúvidas frequentes', 'Materiais disponíveis'] },
      { title: '04 / Direção visual', fields: ['Direção visual', 'Cores da marca', 'Referências visuais', 'O que evitar'] },
      { title: '05 / Próximos passos', fields: ['Nome do contato', 'Cargo ou relação', 'E-mail', 'Telefone do cliente', 'Prazo desejado', 'Faixa de investimento', 'Informações adicionais'] }
    ];
    reviewGrid.innerHTML = groups.map((group) => `
      <article class="review-card">
        <h4>${escapeHtml(group.title)}</h4>
        ${group.fields.map((field) => `<p><strong>${escapeHtml(field)}:</strong> ${escapeHtml(answers[field])}</p>`).join('')}
      </article>
    `).join('');
    return answers;
  }

  async function openWhatsApp() {
    const answers = collectAnswers();
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    sendButton.textContent = 'Abrindo WhatsApp...';
    sendButton.disabled = true;
    formFeedback.textContent = '';
    try {
      const response = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.whatsappUrl) throw new Error(result.message || 'Não foi possível validar o briefing.');
      if (popup) popup.location.replace(result.whatsappUrl);
      else window.location.assign(result.whatsappUrl);
    } catch (error) {
      if (popup) popup.close();
      formFeedback.textContent = error.message || 'Não foi possível abrir o WhatsApp agora. Tente novamente.';
      document.querySelector('.briefing-shell').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      sendButton.textContent = 'Enviar pelo WhatsApp';
      sendButton.disabled = false;
    }
  }

  nextButton.addEventListener('click', () => {
    if (validateStep(currentStep)) {
      setStep(currentStep + 1);
      document.querySelector('.briefing-shell').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  prevButton.addEventListener('click', () => {
    setStep(currentStep - 1);
    document.querySelector('.briefing-shell').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  reviewButton.addEventListener('click', () => {
    if (!validateStep(currentStep)) return;
    renderReview();
    reviewSection.hidden = false;
    reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  editButton.addEventListener('click', () => {
    reviewSection.hidden = true;
    setStep(1);
    document.querySelector('.briefing-shell').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  sendButton.addEventListener('click', openWhatsApp);

  form.addEventListener('input', (event) => {
    const field = event.target.closest('.field');
    if (field) clearFieldError(field);
    if (event.target.id === 'phone') {
      event.target.value = event.target.value.replace(/\D/g, '').slice(0, 11).replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    }
  });

  heroCta.addEventListener('click', () => window.setTimeout(() => document.querySelector('#companyName').focus(), 500));
  document.querySelectorAll('.final-cta a').forEach((link) => link.addEventListener('click', () => window.setTimeout(() => document.querySelector('#companyName').focus(), 500)));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

  setStep(1);
})();
