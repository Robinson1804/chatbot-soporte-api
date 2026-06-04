const toolDeclarations = [
  {
    name: 'generate_document',
    description: 'Genera un documento Word ANEXO 01-04 pre-completado. Llamar SOLO después de confirmar todos los datos con el usuario.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          enum: ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04', 'ANEXO07'],
          description: 'Tipo de documento a generar. ANEXO07=Transferencia de información entre áreas.',
        },
        datos: {
          type: 'OBJECT',
          description: 'Objeto con los datos del usuario para pre-completar el documento',
        },
      },
      required: ['tipo', 'datos'],
    },
  },
  {
    name: 'create_ssi_ticket',
    description: 'Crea un ticket en el SSI. Llamar SOLO cuando el usuario aceptó explícitamente la creación automática.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo:      { type: 'STRING', description: 'Título descriptivo (máx 100 caracteres)' },
        descripcion: { type: 'STRING', description: 'Descripción completa del problema' },
        categoria:   { type: 'STRING', description: 'Categoría SSI exacta del listado oficial' },
        sede:        { type: 'STRING', description: 'Sede del usuario, exactamente como figura en el listado SSI' },
      },
      required: ['titulo', 'descripcion', 'categoria', 'sede'],
    },
  },
  {
    name: 'download_template',
    description: 'Ofrece la descarga de una plantilla en blanco para completar manualmente. PROD02=Solicitud acceso BD, F01=Altas y Bajas sistemas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          enum: ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04', 'PROD02', 'F01', 'ANEXO07'],
        },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'set_urgency',
    description: 'Establece nivel de urgencia del problema. P1=Crítico masivo, P2=Usuario bloqueado, P3=Normal planificado, P4=Consulta informativa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nivel: { type: 'STRING', enum: ['P1', 'P2', 'P3', 'P4'] },
      },
      required: ['nivel'],
    },
  },
  {
    name: 'show_chips',
    description: 'Muestra botones de respuesta rápida para guiar la conversación.',
    parameters: {
      type: 'OBJECT',
      properties: {
        opciones: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Lista de opciones a mostrar como botones',
        },
      },
      required: ['opciones'],
    },
  },
  {
    name: 'show_form',
    description: 'Muestra un formulario inline en el chat para que el usuario complete datos estructurados. Usar cuando se necesiten varios campos de datos del usuario (ej. para generar un anexo). El usuario completa el formulario y hace click en Registrar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo: {
          type: 'STRING',
          description: 'Título del formulario, ej. "Datos para ANEXO 02"',
        },
        campos: {
          type: 'ARRAY',
          description: 'Lista de campos del formulario',
          items: {
            type: 'OBJECT',
            properties: {
              id:          { type: 'STRING',  description: 'Identificador único del campo' },
              label:       { type: 'STRING',  description: 'Etiqueta visible del campo' },
              placeholder: { type: 'STRING',  description: 'Texto de ayuda dentro del input' },
              tipo:        { type: 'STRING',  description: 'Tipo: text, date, select, number' },
              opciones:    { type: 'ARRAY',   items: { type: 'STRING' }, description: 'Opciones para tipo select' },
              requerido:   { type: 'BOOLEAN', description: 'Si el campo es obligatorio' },
            },
            required: ['id', 'label', 'tipo'],
          },
        },
      },
      required: ['titulo', 'campos'],
    },
  },
];

module.exports = toolDeclarations;
