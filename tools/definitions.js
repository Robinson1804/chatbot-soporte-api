const toolDeclarations = [
  {
    name: 'generate_document',
    description:
      'Genera un documento Word de anexos OTIN/INEI pre-completado. Llamar SOLO después de confirmar todos los datos necesarios con el usuario. Para ANEXO01 y ANEXO02 usar datos.modalidad para indicar individual, grupal o vpn.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          enum: [
            'ANEXO01',
            'ANEXO02',
            'ANEXO03',
            'ANEXO04',
            'ANEXO07',
            'ANEXO01_INDIVIDUAL',
            'ANEXO01_GRUPAL',
            'ANEXO01_VPN',
            'ANEXO02_INDIVIDUAL',
            'ANEXO02_GRUPAL',
          ],
          description:
            'Tipo de documento a generar. Preferir ANEXO01/ANEXO02 con datos.modalidad. ANEXO07=Transferencia de información entre áreas.',
        },
        datos: {
          type: 'OBJECT',
          description:
            'Objeto con los datos para completar el documento. Debe incluir modalidad cuando corresponda y usuarios[] para formatos grupales.',
          properties: {
            modalidad: {
              type: 'STRING',
              enum: ['individual', 'grupal', 'vpn'],
              description:
                'Modalidad del documento. ANEXO01 permite individual, grupal o vpn. ANEXO02 permite individual o grupal.',
            },

            // Datos comunes
            nombres: {
              type: 'STRING',
              description: 'Nombres y apellidos del usuario principal.',
            },
            dni: {
              type: 'STRING',
              description: 'Documento de identidad del usuario.',
            },
            cargo: {
              type: 'STRING',
              description: 'Cargo o función del usuario.',
            },
            oficina: {
              type: 'STRING',
              description: 'Dirección, oficina, área o dependencia del usuario.',
            },
            direccion: {
              type: 'STRING',
              description: 'Alias de oficina/dirección. Usar si el usuario dice Dirección u Oficina.',
            },
            sede: {
              type: 'STRING',
              description: 'Sede del usuario.',
            },
            correo: {
              type: 'STRING',
              description: 'Correo institucional del usuario, si corresponde.',
            },
            correoInstitucional: {
              type: 'STRING',
              description: 'Correo institucional del usuario.',
            },
            telefono: {
              type: 'STRING',
              description: 'Teléfono, celular o anexo de contacto.',
            },
            fechaSolicitud: {
              type: 'STRING',
              description: 'Fecha de solicitud en formato DD/MM/YYYY.',
            },
            fechaInicio: {
              type: 'STRING',
              description: 'Fecha de inicio en formato DD/MM/YYYY.',
            },
            fechaTermino: {
              type: 'STRING',
              description: 'Fecha de término en formato DD/MM/YYYY.',
            },
            fechaInicioContrato: {
              type: 'STRING',
              description: 'Fecha de inicio del contrato.',
            },
            fechaTerminoContrato: {
              type: 'STRING',
              description: 'Fecha de término del contrato.',
            },
            fechaInicioAcceso: {
              type: 'STRING',
              description: 'Fecha de inicio del acceso o permiso.',
            },
            fechaTerminoAcceso: {
              type: 'STRING',
              description: 'Fecha de término del acceso o permiso.',
            },
            tipoContrato: {
              type: 'STRING',
              enum: ['Nombrado', 'CAS', 'Locador', 'Orden de Servicio', 'Otros'],
              description: 'Tipo de contrato del usuario.',
            },
            numeroOS: {
              type: 'STRING',
              description: 'Número de Orden de Servicio. Si no aplica, usar "No aplica".',
            },

            // ANEXO 01
            tipoAcceso: {
              type: 'STRING',
              description:
                'Para ANEXO01: Acceso remoto, VPN, Desbloqueo USB, o ambos.',
            },
            justificacionRemoto: {
              type: 'STRING',
              description: 'Justificación para acceso remoto o VPN.',
            },
            justificacionUSB: {
              type: 'STRING',
              description: 'Justificación para desbloqueo de USB o medios removibles.',
            },
            usuarioRed: {
              type: 'STRING',
              description: 'Usuario de red INEI. Obligatorio para formato VPN.',
            },
            ipOpcional: {
              type: 'STRING',
              description: 'IP opcional para formato VPN.',
            },
            correoPersonal: {
              type: 'STRING',
              description:
                'Correo personal para doble autenticación VPN. No usar como correo institucional.',
            },
            hostEquipo: {
              type: 'STRING',
              description: 'HOST o nombre del equipo personal del usuario para VPN.',
            },

            // ANEXO 02
            tipoSolicitud: {
              type: 'STRING',
              enum: ['Creación', 'Actualización', 'Modificación', 'Baja', 'Desactivación', 'Acceso'],
              description:
                'Tipo de solicitud. Para ANEXO02 usar Creación, Actualización, Baja o Desactivación. Para ANEXO04 usar Acceso, Modificación o Quitar permisos.',
            },
            cuentaRed: {
              type: 'BOOLEAN',
              description: 'ANEXO02: si solicita cuenta de usuario de red.',
            },
            internet: {
              type: 'BOOLEAN',
              description: 'ANEXO02: si solicita acceso a Internet.',
            },
            correoInstitucionalSolicitado: {
              type: 'BOOLEAN',
              description: 'ANEXO02: si solicita cuenta de correo institucional.',
            },
            perfilInternet: {
              type: 'STRING',
              description:
                'ANEXO02: perfil de Internet. Puede ser 1, 2 o 3. Perfil 1=Avanzado, Perfil 2=Intermedio, Perfil 3=Básico.',
            },
            capacidadBuzon: {
              type: 'STRING',
              description: 'ANEXO02: nueva capacidad de buzón solicitada, si corresponde.',
            },
            nombreGenerico: {
              type: 'STRING',
              description: 'ANEXO02: nombre de usuario genérico si aplica.',
            },
            ipAsignada: {
              type: 'STRING',
              description: 'ANEXO02: IP asignada. Normalmente llenado por OTIN.',
            },

            // ANEXO 03
            area: {
              type: 'STRING',
              description: 'ANEXO03: área solicitante.',
            },
            jefeArea: {
              type: 'STRING',
              description: 'ANEXO03: jefe del área solicitante.',
            },
            usuarioSolicitante: {
              type: 'STRING',
              description: 'ANEXO03: usuario solicitante.',
            },
            proposito: {
              type: 'STRING',
              description: 'ANEXO03: propósito de la carpeta FTP.',
            },

            // ANEXO 04
            servidor: {
              type: 'STRING',
              description: 'ANEXO04: servidor donde está el recurso compartido. Ejemplo: \\\\SAN 01.',
            },
            recurso: {
              type: 'STRING',
              description: 'ANEXO04: carpeta o ruta del recurso compartido solicitado.',
            },
            permiso: {
              type: 'STRING',
              enum: ['Lectura', 'Escritura', 'Control Total'],
              description: 'ANEXO04: tipo de permiso solicitado.',
            },

            // Firmantes / autorizaciones
            justificacion: {
              type: 'STRING',
              description: 'Justificación general de la solicitud.',
            },
            solicitante: {
              type: 'STRING',
              description: 'Nombres completos del solicitante.',
            },
            nombresSolicitante: {
              type: 'STRING',
              description: 'Nombres completos del solicitante.',
            },
            director: {
              type: 'STRING',
              description: 'Director o funcionario autorizado.',
            },
            nombreDirector: {
              type: 'STRING',
              description: 'Nombre completo del director o funcionario autorizado.',
            },

            // Formatos grupales
            usuarios: {
              type: 'ARRAY',
              description:
                'Lista de usuarios para formatos grupales. Obligatorio cuando modalidad=grupal o cuando ANEXO03 requiere varios usuarios FTP.',
              items: {
                type: 'OBJECT',
                properties: {
                  i: {
                    type: 'STRING',
                    description: 'Número de fila. Si no se conoce, puede omitirse.',
                  },
                  nombres: {
                    type: 'STRING',
                    description: 'Nombres y apellidos del usuario.',
                  },
                  dni: {
                    type: 'STRING',
                    description: 'DNI del usuario.',
                  },
                  cargo: {
                    type: 'STRING',
                    description: 'Cargo o función del usuario.',
                  },
                  usuarioRed: {
                    type: 'STRING',
                    description: 'Usuario de red INEI o correo institucional.',
                  },
                  correoInstitucional: {
                    type: 'STRING',
                    description: 'Correo institucional del usuario.',
                  },
                  contrato: {
                    type: 'STRING',
                    description: 'Tipo de contrato del usuario.',
                  },
                  tipoContrato: {
                    type: 'STRING',
                    description: 'Tipo de contrato del usuario.',
                  },
                  numeroOS: {
                    type: 'STRING',
                    description: 'Número de Orden de Servicio, si aplica.',
                  },
                  inicio: {
                    type: 'STRING',
                    description: 'Fecha de inicio del permiso.',
                  },
                  fin: {
                    type: 'STRING',
                    description: 'Fecha de fin del permiso.',
                  },
                  tipoAcceso: {
                    type: 'STRING',
                    description: 'ANEXO01 grupal: Acceso remoto, VPN, USB o ambos.',
                  },
                  tipoSolicitud: {
                    type: 'STRING',
                    description: 'ANEXO02 grupal: Creación, Modificación, Baja o Desactivación.',
                  },
                  perfilInternet: {
                    type: 'STRING',
                    description: 'ANEXO02 grupal: perfil 1, 2 o 3.',
                  },
                  correoInstitucionalSolicitado: {
                    type: 'BOOLEAN',
                    description: 'ANEXO02 grupal: si solicita correo institucional.',
                  },
                  ipAsignada: {
                    type: 'STRING',
                    description: 'ANEXO02 grupal: IP asignada.',
                  },

                  // ANEXO03 usuarios FTP
                  area: {
                    type: 'STRING',
                    description: 'ANEXO03: área del usuario.',
                  },
                  proyecto: {
                    type: 'STRING',
                    description: 'ANEXO03: proyecto relacionado.',
                  },
                  nombre: {
                    type: 'STRING',
                    description: 'ANEXO03: nombres del usuario.',
                  },
                  apellidos: {
                    type: 'STRING',
                    description: 'ANEXO03: apellidos del usuario.',
                  },
                  lectura: {
                    type: 'BOOLEAN',
                    description: 'ANEXO03: permiso de lectura.',
                  },
                  escritura: {
                    type: 'BOOLEAN',
                    description: 'ANEXO03: permiso de escritura.',
                  },
                },
              },
            },

            // ANEXO07
            areaOrigen: {
              type: 'STRING',
              description: 'ANEXO07: área origen.',
            },
            areaDestino: {
              type: 'STRING',
              description: 'ANEXO07: área destino.',
            },
            descripcion: {
              type: 'STRING',
              description: 'ANEXO07: descripción de la información a transferir.',
            },
          },
        },
      },
      required: ['tipo', 'datos'],
    },
  },
  {
    name: 'create_ssi_ticket',
    description:
      'Crea un ticket en el SSI. Llamar SOLO cuando el usuario aceptó explícitamente la creación automática.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo: {
          type: 'STRING',
          description: 'Título descriptivo del ticket. Máximo 100 caracteres.',
        },
        descripcion: {
          type: 'STRING',
          description: 'Descripción completa del problema o solicitud.',
        },
        categoria: {
          type: 'STRING',
          description: 'Categoría SSI exacta del listado oficial.',
        },
        sede: {
          type: 'STRING',
          description: 'Sede del usuario, exactamente como figura en el listado SSI.',
        },
        categoriaId: {
          type: 'STRING',
          description: 'ID interno de categoría SSI si está disponible.',
        },
        sedeId: {
          type: 'STRING',
          description: 'ID interno de sede SSI si está disponible.',
        },
      },
      required: ['titulo', 'descripcion', 'categoria', 'sede'],
    },
  },
  {
    name: 'download_template',
    description:
      'Ofrece la descarga de una plantilla en blanco para completar manualmente. Soporta anexos separados por modalidad. PROD02=Solicitud acceso BD, F01=Altas y Bajas sistemas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          enum: [
            'ANEXO01',
            'ANEXO01_INDIVIDUAL',
            'ANEXO01_GRUPAL',
            'ANEXO01_VPN',
            'ANEXO02',
            'ANEXO02_INDIVIDUAL',
            'ANEXO02_GRUPAL',
            'ANEXO03',
            'ANEXO04',
            'ANEXO07',
            'PROD02',
            'F01',
          ],
          description:
            'Tipo de plantilla a descargar. Usar los tipos separados cuando el usuario pida una modalidad específica.',
        },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'set_urgency',
    description:
      'Establece nivel de urgencia del problema. P1=Crítico masivo, P2=Usuario bloqueado, P3=Normal planificado, P4=Consulta informativa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nivel: {
          type: 'STRING',
          enum: ['P1', 'P2', 'P3', 'P4'],
        },
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
          description: 'Lista de opciones a mostrar como botones.',
        },
      },
      required: ['opciones'],
    },
  },
  {
    name: 'show_form',
    description:
      'Muestra un formulario inline en el chat para que el usuario complete datos estructurados. Usar cuando se necesiten varios campos de datos del usuario, por ejemplo para generar un anexo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo: {
          type: 'STRING',
          description: 'Título del formulario, ej. "Datos para ANEXO 02".',
        },
        campos: {
          type: 'ARRAY',
          description: 'Lista de campos del formulario.',
          items: {
            type: 'OBJECT',
            properties: {
              id: {
                type: 'STRING',
                description: 'Identificador único del campo.',
              },
              label: {
                type: 'STRING',
                description: 'Etiqueta visible del campo.',
              },
              placeholder: {
                type: 'STRING',
                description: 'Texto de ayuda dentro del input.',
              },
              tipo: {
                type: 'STRING',
                description: 'Tipo de campo: text, date, select, number, textarea.',
              },
              opciones: {
                type: 'ARRAY',
                items: { type: 'STRING' },
                description: 'Opciones para tipo select.',
              },
              requerido: {
                type: 'BOOLEAN',
                description: 'Si el campo es obligatorio.',
              },
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