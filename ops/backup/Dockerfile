FROM postgres:16-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/arcigy-backup
COPY backup-core.mjs b2-native.mjs backup-runner.mjs restore-runner.mjs ./

USER 999:999
CMD ["node", "backup-runner.mjs"]
