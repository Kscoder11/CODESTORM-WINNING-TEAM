FROM python:3.11-slim

RUN useradd -m -s /bin/bash executor_user
WORKDIR /workspace
RUN chown -R executor_user:executor_user /workspace
USER executor_user
