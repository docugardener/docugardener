{{/*
Expand the name of the chart.
*/}}
{{- define "docugardener.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "docugardener.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "docugardener.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "docugardener.labels" -}}
helm.sh/chart: {{ include "docugardener.chart" . }}
app.kubernetes.io/name: {{ include "docugardener.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels (stable subset — must not change after initial deploy).
*/}}
{{- define "docugardener.selectorLabels" -}}
app.kubernetes.io/name: {{ include "docugardener.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "docugardener.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "docugardener.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image helper — respects global.imageRegistry prefix.
Usage: {{ include "docugardener.image" (dict "image" .Values.api.image "global" .Values.global "defaultTag" .Chart.AppVersion) }}
*/}}
{{- define "docugardener.image" -}}
{{- $registry := .global.imageRegistry | default "" -}}
{{- $repo := .image.repository -}}
{{- $tag := .image.tag | default .defaultTag -}}
{{- if $registry -}}
{{ printf "%s/%s:%s" $registry $repo $tag }}
{{- else -}}
{{ printf "%s:%s" $repo $tag }}
{{- end -}}
{{- end }}

{{/*
Secret name — either the user-supplied existingSecret or the chart-managed secret.
*/}}
{{- define "docugardener.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{ .Values.secrets.existingSecret }}
{{- else -}}
{{ include "docugardener.fullname" . }}-secrets
{{- end -}}
{{- end }}

{{/*
Pod Security Context (PSA restricted).
*/}}
{{- define "docugardener.podSecurityContext" -}}
{{ toYaml .Values.podSecurityContext }}
{{- end }}

{{/*
Container Security Context (PSA restricted).
*/}}
{{- define "docugardener.containerSecurityContext" -}}
{{ toYaml .Values.containerSecurityContext }}
{{- end }}

{{/*
Common environment variables sourced from the secret.
*/}}
{{- define "docugardener.secretEnvVars" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "docugardener.secretName" . }}
      key: {{ .Values.secrets.keys.databaseUrl | default "DATABASE_URL" }}
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "docugardener.secretName" . }}
      key: {{ .Values.secrets.keys.redisUrl | default "REDIS_URL" }}
- name: GEMINI_API_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "docugardener.secretName" . }}
      key: {{ .Values.secrets.keys.geminiApiKey | default "GEMINI_API_KEY" }}
- name: GITHUB_APP_ID
  valueFrom:
    secretKeyRef:
      name: {{ include "docugardener.secretName" . }}
      key: {{ .Values.secrets.keys.githubAppId | default "GITHUB_APP_ID" }}
- name: GITHUB_PRIVATE_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "docugardener.secretName" . }}
      key: {{ .Values.secrets.keys.githubPrivateKey | default "GITHUB_PRIVATE_KEY" }}
- name: ENCRYPTION_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "docugardener.secretName" . }}
      key: {{ .Values.secrets.keys.encryptionKey | default "ENCRYPTION_KEY" }}
{{- end }}

{{/*
Common non-secret environment variables from ConfigMap.
*/}}
{{- define "docugardener.configEnvVars" -}}
- name: APP_ENV
  valueFrom:
    configMapKeyRef:
      name: {{ include "docugardener.fullname" . }}-config
      key: APP_ENV
- name: LOG_LEVEL
  valueFrom:
    configMapKeyRef:
      name: {{ include "docugardener.fullname" . }}-config
      key: LOG_LEVEL
- name: VECTOR_DB_PROVIDER
  valueFrom:
    configMapKeyRef:
      name: {{ include "docugardener.fullname" . }}-config
      key: VECTOR_DB_PROVIDER
- name: WEAVIATE_URL
  valueFrom:
    configMapKeyRef:
      name: {{ include "docugardener.fullname" . }}-config
      key: WEAVIATE_URL
- name: DEBUG
  valueFrom:
    configMapKeyRef:
      name: {{ include "docugardener.fullname" . }}-config
      key: DEBUG
{{- end }}

{{/*
emptyDir volumes for writable temp paths (PSA readOnlyRootFilesystem).
*/}}
{{- define "docugardener.tmpVolumes" -}}
- name: tmp
  emptyDir:
    medium: Memory
    sizeLimit: 512Mi
{{- end }}

{{/*
emptyDir volume mounts for writable temp paths.
*/}}
{{- define "docugardener.tmpVolumeMounts" -}}
- name: tmp
  mountPath: /tmp
{{- end }}

{{/*
imagePullSecrets block.
*/}}
{{- define "docugardener.imagePullSecrets" -}}
{{- if .Values.global.imagePullSecrets }}
imagePullSecrets:
{{ toYaml .Values.global.imagePullSecrets | indent 2 }}
{{- end }}
{{- end }}
