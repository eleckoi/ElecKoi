package com.eleckoi.android.foundation.storage.room

import androidx.room.Entity

@Entity(
    tableName = "variable_configs",
    primaryKeys = ["characterId"],
)
data class VariableConfigEntity(
    val characterId: String,
    val name: String,
    val initialStateJson: String,
    val schemaCode: String,
    val objectsJson: String,
    val variablesJson: String,
    val expandedObjectIdsJson: String,
    val activeVersionId: String,
    val versionsJson: String,
    val updatedAt: String,
)
