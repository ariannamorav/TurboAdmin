# TurboAdmin

Aplicación web para la gestión administrativa de un taller automotriz, desarrollada como proyecto académico para **TurboCajas**.

## Descripción

TurboAdmin permite gestionar diferentes procesos administrativos y operativos de un taller automotriz desde una única aplicación web.

El sistema integra una arquitectura basada en **frontend y backend**, donde el frontend fue desarrollado con React y el backend mediante FastAPI, encargado de administrar las solicitudes del cliente y exponer servicios REST.

## Funcionalidades

### Gestión de clientes

* Registrar clientes.
* Consultar clientes.
* Buscar información.
* Editar registros.
* Eliminar registros.
* Validar información antes de almacenarla.

### Gestión de vehículos

* Registrar vehículos.
* Asociar vehículos con clientes.
* Consultar información.
* Editar registros.
* Eliminar vehículos.
* Buscar y filtrar información.

### Gestión de repuestos

* Registrar repuestos.
* Consultar existencias.
* Buscar y filtrar repuestos.
* Actualizar información.
* Gestionar disponibilidad.

### Gestión de servicios

* Registrar servicios.
* Consultar servicios.
* Buscar y filtrar información.
* Actualizar servicios.
* Gestionar disponibilidad.
* Vincular servicios con órdenes de trabajo.

### Órdenes de trabajo

Las órdenes de trabajo integran la información del **cliente, vehículo, repuestos y servicios**, permitiendo realizar seguimiento al proceso.

Entre sus funcionalidades se encuentran:

* Crear órdenes de trabajo.
* Consultar órdenes.
* Editar órdenes.
* Cambiar el estado de una orden.
* Agregar repuestos.
* Agregar servicios.
* Calcular automáticamente el total.
* Filtrar órdenes por estado.

### Facturación

El sistema permite generar facturas a partir de las órdenes de trabajo.

Incluye:

* Selección de la orden a facturar.
* Aplicación de descuentos.
* Selección del método de pago.
* Generación de la factura.
* Consulta de facturas.
* Visualización de la factura en PDF.

Las facturas generadas incluyen información del taller, cliente, vehículo, repuestos, servicios, descuento aplicado y total a pagar, y pueden ser visualizadas, impresas o descargadas en formato PDF.

### Dashboard

El sistema incorpora un **dashboard administrativo** para visualizar información relevante del funcionamiento del taller.

El tablero presenta indicadores relacionados con las órdenes y la facturación, además de gráficos y listas que permiten analizar el comportamiento de la operación.

## Arquitectura

El proyecto utiliza una arquitectura basada en la separación entre frontend y backend:

```text
Frontend
React
   │
   │ HTTP / REST
   ▼
Backend
FastAPI
   │
   ▼
Base de datos
TiDB
```

El frontend fue desarrollado con **React, HTML5, CSS3 y Bootstrap**, mientras que FastAPI se utilizó para administrar las solicitudes y estructurar los servicios REST.

## Tecnologías

### Backend

`Python` `FastAPI`

### Frontend

`TypeScript` `React` `Bootstrap`

### Base de datos

`TiDB`

### Herramientas

`Git` `GitHub` `Postman` `Visual Studio Code`

## Metodología

El proceso contempló el levantamiento de requisitos, diseño del sistema, desarrollo, pruebas funcionales y de integración, además de validaciones relacionadas con seguridad, rendimiento y usabilidad.

## Contexto del proyecto

**Proyecto:** TurboAdmin
**Contexto:** Gestión administrativa para taller automotriz
**Cliente:** TurboCajas
**Tipo:** Proyecto académico
**Área:** Desarrollo de software y gestión de información

El objetivo principal fue desarrollar una aplicación web capaz de estructurar y centralizar la información del taller, facilitando el ingreso de datos y apoyando la toma de decisiones mediante la representación gráfica de la información.

## Sustentación

Puedes consultar la sustentación del proyecto en el siguiente video:

[Ver sustentación del proyecto en YouTube](https://www.youtube.com/watch?v=VF8IjuzRUyU)

---

Proyecto desarrollado como parte de la formación en Ingeniería de Sistemas.

