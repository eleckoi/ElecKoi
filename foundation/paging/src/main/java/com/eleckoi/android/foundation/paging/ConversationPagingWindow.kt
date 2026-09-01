package com.eleckoi.android.foundation.paging

import androidx.paging.CombinedLoadStates
import androidx.paging.LoadState
import androidx.paging.PagingData
import androidx.paging.PagingDataEvent
import androidx.paging.PagingDataPresenter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * UI-toolkit-neutral Paging presenter. Both chat surfaces use this exact window instead of keeping
 * their own Room cursor, page cache, and merge rules.
 */
class ConversationPagingWindow<T : Any>(
    private val scope: CoroutineScope,
    private val source: Flow<PagingData<T>>,
) {
    private val presenter = object : PagingDataPresenter<T>(Dispatchers.Main.immediate) {
        override suspend fun presentPagingDataEvent(event: PagingDataEvent<T>) = Unit
    }
    // `null` means Paging has not presented its first snapshot yet. An empty list is a real,
    // authoritative result. Collapsing those states briefly erased Room's first-frame projection.
    private val mutableItems = MutableStateFlow<List<T>?>(null)
    val items: StateFlow<List<T>?> = mutableItems.asStateFlow()
    val loadStates: StateFlow<CombinedLoadStates?> = presenter.loadStateFlow
    private var collectionJob: Job? = null
    private var pageUpdatesJob: Job? = null

    fun start() {
        if (collectionJob != null) return
        pageUpdatesJob = scope.launch {
            presenter.onPagesUpdatedFlow.collect {
                mutableItems.value = presenter.snapshot().items
            }
        }
        collectionJob = scope.launch {
            source.collectLatest { pagingData -> presenter.collectFrom(pagingData) }
        }
    }

    /** Accessing the first presented item emits Paging's viewport hint and prefetches older rows. */
    fun requestOlder() {
        if (presenter.size > 0) presenter[0]
    }

    fun refresh() = presenter.refresh()

    fun stop() {
        collectionJob?.cancel()
        pageUpdatesJob?.cancel()
        collectionJob = null
        pageUpdatesJob = null
    }

    fun hasOlder(): Boolean = presenter.loadStateFlow.value?.prepend?.let { state ->
        state !is LoadState.NotLoading || !state.endOfPaginationReached
    } ?: true
}
