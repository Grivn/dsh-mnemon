# Collaboration

An independent Source for project rooms, session membership, directed messages, presence and expiring file reservations. Install it with the workspace Strategy. Each instance owns its records and revision-fenced management page; no other Source's store is accessed.

Room creators invite or remove sessions, allow open joining, and close rooms while retaining history. Messages require current membership and one to eight other members. Model evidence contains only messages addressed to the current session or sent by it. Delivery uses DSH's public session APIs with plugin provenance. Sending and waking are explicit actions; model-initiated delivery requires the Host's external-action approval. Per-recipient receipts retain partial failures without automatic retries. Attachments are bounded references inside configured `attachmentRoots`, with the project root included.

Existing project files can be reserved for 1–120 minutes. Only their owner can renew or release an active lease; expiry permits another session to claim it. Reservations coordinate work and do not lock a user's editor. Model reservation changes check the exact room or reservation version pinned by their View. Presence reports the native DSH session status.

Configure `dataDir` for storage and `attachmentRoots` for additional allowed paths. The server requires the public DSH agents, sessionQuery and workspaceRegistry services. `pnpm verify` exercises scope isolation, delivery approval, membership changes, lease conflicts and retained history.

## 简体中文

独立 Source 提供项目协作空间、成员管理、定向消息、在线状态和文件预约。创建者可邀请或移除会话、开放加入、关闭空间；关闭后保留历史。模型只能读取自己发送或收到的消息。发送前检查当前成员关系，投递使用 DSH 公开会话接口并保留插件来源；唤醒需显式选择，模型发起的投递需通过宿主的外部操作审批。逐个收件人的结果单独保留，部分失败不会自动重发。

附件采用项目目录或配置的 `attachmentRoots` 内的文件引用。文件预约有效期为 1–120 分钟，持有者可续期或释放，过期后可由其他会话接手；它用于协调，不会锁住用户的编辑器。模型修改预约时检查 View 中的记录版本。插件独立持久化，按项目隔离，停用时保留记录。
